const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { defineSecret } = require("firebase-functions/params");
// node:crypto, no el `crypto` global. El global es WebCrypto y NO tiene
// createHash — fallaría recién al ejecutarse, no al compilar.
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient, CompareFacesCommand } = require("@aws-sdk/client-rekognition");

admin.initializeApp();

// Techo de instancias, aplicado como valor por defecto a cada función.
//
// OJO CON LO QUE ESTO ES Y LO QUE NO. Son 10 instancias POR FUNCIÓN, no 10
// para todo AquíMatch: con trece funciones desplegadas, el techo real son 130.
// Y cada instancia atiende varias solicitudes a la vez (el valor por defecto
// de concurrencia son 80), así que tampoco equivale a 130 solicitudes.
//
// NO ES UN PRESUPUESTO. No corta el gasto: acota la velocidad a la que puede
// crecer. El único techo de plata de verdad está en las cuotas y presupuestos
// de la consola de Google y de AWS, y eso no se configura desde acá.
//
// Tampoco es cierto que lo peor sea ir lento: al llegar al techo, una función
// invocable empieza a RECHAZAR solicitudes, y eso lo ve el usuario como un
// error. Es un intercambio deliberado — preferimos que a alguien le falle una
// pantalla antes que despertar con una factura impagable— pero es un
// intercambio, no un almuerzo gratis.
//
// 10 es holgado para el volumen de hoy (19 instalaciones el 2026-09-08). Hay
// que revisarlo cuando crezcamos, y antes de cualquier campaña.
setGlobalOptions({ maxInstances: 10 });

const AWS_ACCESS_KEY_ID = defineSecret("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = defineSecret("AWS_SECRET_ACCESS_KEY");

// Umbral de aprobación (%). Definido junto con Max: 30% o más se aprueba
// sola; menos de 30% se rechaza sola. Sin revisión manual por ahora —
// versión simple para arrancar, se puede volver más estricta más adelante.
const UMBRAL_APROBACION = 30;

// Descarga una imagen desde su URL pública de Firebase Storage y la
// devuelve como bytes, que es lo que pide Rekognition.
// Máximo que aceptamos bajar de una imagen. Storage ya limita la subida a 10
// MB, pero ese límite protege al bucket, no a esta función: acá la URL la
// elige el cliente, así que podría apuntar a cualquier archivo enorme del
// mundo y hacernos gastar memoria y tiempo.
const MAX_BYTES_IMAGEN = 12 * 1024 * 1024;
const TIMEOUT_DESCARGA_MS = 20 * 1000;

// Solo se baja de acá. Son los dos dominios con los que Firebase Storage sirve
// archivos.
const DOMINIOS_DE_STORAGE = [
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
];

/**
 * Baja una imagen de Firebase Storage y la devuelve como bytes.
 *
 * Antes esto era un `fetch(url)` a secas, con la URL saliendo de
 * `fotoPrincipal` o de una selfie heredada — dos campos que escribe el propio
 * cliente. O sea: cualquiera con la sesión iniciada podía hacer que NUESTRO
 * servidor pidiera la dirección que se le antojara, y bajarse el cuerpo
 * completo sin ningún límite de tamaño ni de tiempo.
 *
 * No se llegó a demostrar que de ahí saliera nada grave (el servidor de
 * metadatos de Google exige una cabecera que un fetch normal no manda), pero
 * un servidor que pide URLs ajenas por orden de un desconocido es una pieza
 * que sirve para cosas feas: sondear servicios internos, o usarnos de
 * intermediarios contra un tercero. Y el costo sí es inmediato.
 *
 * Ahora: solo dominios de Storage, solo HTTPS, con tope de bytes y de tiempo.
 */
async function descargarImagenComoBytes(url) {
  let direccion;
  try {
    direccion = new URL(url);
  } catch {
    throw new Error("La dirección de la imagen no es válida");
  }
  if (direccion.protocol !== "https:" || !DOMINIOS_DE_STORAGE.includes(direccion.hostname)) {
    throw new Error(`Origen de imagen no permitido: ${direccion.hostname}`);
  }

  const cancelar = AbortSignal.timeout(TIMEOUT_DESCARGA_MS);
  const respuesta = await fetch(direccion, { redirect: "error", signal: cancelar });
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar la imagen (${respuesta.status})`);
  }
  // Se mira lo que declara la cabecera para cortar temprano, y después el
  // tamaño real: la cabecera la pone el servidor de origen y puede mentir o
  // no venir.
  const declarado = Number(respuesta.headers.get("content-length") || 0);
  if (declarado > MAX_BYTES_IMAGEN) {
    throw new Error("La imagen es demasiado grande");
  }
  const arrayBuffer = await respuesta.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES_IMAGEN) {
    throw new Error("La imagen es demasiado grande");
  }
  return Buffer.from(arrayBuffer);
}

// Lee un archivo del bucket con permisos de servidor, sin pasar por ninguna
// URL pública. Es lo que permite que la selfie no tenga token de descarga.
/**
 * Lee la selfie de verificación de una persona desde Storage.
 *
 * Recibe el uid, NO una ruta libre. Antes recibía la ruta tal como venía de
 * `selfieRuta`, un campo de los datos privados que escribe el propio dueño —
 * y las reglas no lo amarran a su uid. Como esta lectura la hace el Admin SDK,
 * que se salta las reglas de Storage, alguien podía apuntar `selfieRuta` al
 * archivo de otra cuenta y hacérnoslo procesar.
 *
 * La ruta se arma acá con el uid del documento que disparó la función, así que
 * ya no hay nada que elegir: el campo del cliente solo decide SI hay selfie
 * nueva, no CUÁL.
 */
async function leerSelfieDelBucket(uid) {
  const ruta = `selfies-verificacion/${uid}/selfie.jpg`;
  const [bytes] = await admin.storage().bucket().file(ruta).download();
  return bytes;
}

/**
 * Se dispara cada vez que se actualiza el documento de un usuario.
 * Solo actúa el momento exacto en que estadoVerificacion pasa a
 * "pendiente" por primera vez (o sea, cuando se acaba de subir una selfie
 * nueva) — así no repite el trabajo en cada actualización del perfil.
 */
exports.verificarSelfie = onDocumentUpdated(
  {
    document: "usuarios/{uid}",
    secrets: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY],
    // 60s (el default) no alcanza para fotos de perfil pesadas (cámaras de
    // celulares modernos suben varios MB) — con una foto de 3.6MB la función
    // se quedó sin tiempo a mitad de camino y dejó el perfil trabado en
    // "pendiente" para siempre, sin aprobar, rechazar ni marcar error.
    timeoutSeconds: 120,
  },
  async (event) => {
    const antes = event.data.before.data();
    const despues = event.data.after.data();

    // Antes solo mirábamos si "ya estaba pendiente" para no reprocesar en
    // cada actualización de perfil — pero eso también bloqueaba un
    // reintento legítimo de alguien que quedó trabado en pendiente (ver
    // timeoutSeconds arriba): como el estado ya decía "pendiente" antes de
    // su nuevo intento, la función lo ignoraba silenciosamente y la
    // persona quedaba sin ninguna salida. Lo que de verdad indica "hay una
    // selfie nueva para procesar" es que la URL de la selfie cambió, no el
    // valor de estadoVerificacion por sí solo.
    const ahoraEstaPendiente = despues?.estadoVerificacion === "pendiente";

    // Desde el 2026-08-14 la selfie es un dato biométrico que vive en
    // usuarios/{uid}/privado/datos, no en este documento. Se aceptan las DOS
    // formas de detectar "hay una selfie nueva" a propósito: las versiones de
    // la app ya publicadas siguen escribiendo la URL acá, y si solo miráramos
    // la marca nueva, a esas personas la verificación dejaría de dispararse.
    const selfieNuevaEnPublico =
      !!despues?.selfieVerificacion && despues.selfieVerificacion !== antes?.selfieVerificacion;
    const selfieNuevaPorMarca =
      !!despues?.selfieActualizadaEn && despues.selfieActualizadaEn !== antes?.selfieActualizadaEn;
    if (!ahoraEstaPendiente || (!selfieNuevaEnPublico && !selfieNuevaPorMarca)) return;

    const uid = event.params.uid;
    const ref = admin.firestore().doc(`usuarios/${uid}`);

    const fotoPrincipal = despues.fotoPrincipal;
    // De dónde sale la selfie, en orden de antigüedad de la app que la subió:
    //   1. `selfieRuta` en los datos privados — la forma nueva. Es una RUTA de
    //      Storage, no una URL: el archivo no tiene token de descarga, así que
    //      solo se puede leer desde el servidor. Es un dato biométrico.
    //   2. `selfieVerificacion` en los datos privados — URL con token.
    //   3. `selfieVerificacion` en el documento público — la más vieja de todas.
    // Las dos últimas siguen atendidas mientras queden cuentas sin actualizar.
    const snapPrivado = await admin.firestore().doc(`usuarios/${uid}/privado/datos`).get();
    const privado = snapPrivado.exists ? snapPrivado.data() : {};
    const selfieRuta = privado.selfieRuta;
    const selfieVerificacion = privado.selfieVerificacion || despues.selfieVerificacion;
    // Sin foto de perfil no hay contra qué comparar la selfie. Antes esto era
    // un `return` silencioso y el resultado era una trampa: el estado se
    // quedaba en "pendiente" para siempre, a los 60 segundos la app mostraba
    // "no pudimos verificar tu selfie", la persona se sacaba otra selfie, y
    // volvía a pasar exactamente lo mismo. Nada le decía que lo que faltaba
    // era la foto de perfil.
    //
    // Ahora se deja un estado propio para que la app pueda mandarla a
    // agregarla. Hace falta también para las cuentas que ya quedaron trabadas
    // antes de este arreglo: con solo exigir la foto al crear el perfil, esas
    // seguirian atascadas.
    if (!fotoPrincipal) {
      await ref.update({ estadoVerificacion: "falta_foto" });
      return;
    }
    if (!selfieRuta && !selfieVerificacion) return;

    // TOPE DE INTENTOS. Esta es la función más cara que tenemos: cada vuelta
    // baja dos imágenes y paga una comparación de rostros en AWS. Y se dispara
    // sola cada vez que cambia `selfieActualizadaEn`, que es un campo que la
    // app escribe... o sea que lo puede escribir cualquiera con la sesión
    // iniciada, en un bucle, sin tocar nada más.
    //
    // Nadie legítimo necesita 8 verificaciones en una hora: se saca la selfie,
    // sale bien o sale mal, y a lo sumo la repite dos o tres veces. Pasado ese
    // número se deja `error_verificacion`, que es un estado que la app ya sabe
    // mostrar con su pantalla de reintentar — y NO se deja en "pendiente", que
    // es la trampa contra la que avisan los comentarios de más arriba: alguien
    // esperando para siempre una respuesta que nunca va a llegar.
    const puedeIntentar = await dentroDelLimite(
      admin.firestore().doc(`limites/${uid}`),
      "verificaciones",
      "ventanaVerificaciones",
      MAX_VERIFICACIONES_POR_VENTANA
    );
    if (!puedeIntentar) {
      console.warn(`[verificarSelfie] tope de intentos alcanzado por ${uid}`);
      await ref.update({
        estadoVerificacion: "error_verificacion",
        motivoRechazo: "Demasiados intentos seguidos. Espera un rato y vuelve a intentarlo.",
      });
      return;
    }

    try {
      const [fotoBytes, selfieBytes] = await Promise.all([
        descargarImagenComoBytes(fotoPrincipal),
        selfieRuta
          ? leerSelfieDelBucket(uid)
          : descargarImagenComoBytes(selfieVerificacion),
      ]);

      console.log(
        `[DIAGNOSTICO] fotoPrincipal: ${fotoBytes.length} bytes, selfie: ${selfieBytes.length} bytes`
      );

      const client = new RekognitionClient({
        region: "us-east-2",
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID.value(),
          secretAccessKey: AWS_SECRET_ACCESS_KEY.value(),
        },
      });

      const resultado = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: fotoBytes },
          TargetImage: { Bytes: selfieBytes },
          SimilarityThreshold: 0,
        })
      );

      const coincidencias = resultado.FaceMatches || [];
      const mejorParecido =
        coincidencias.length > 0 ? Math.max(...coincidencias.map((m) => m.Similarity)) : 0;

      const aprobado = mejorParecido >= UMBRAL_APROBACION;

      await ref.update({
        estadoVerificacion: aprobado ? "aprobado" : "rechazado",
        parecidoSelfie: Math.round(mejorParecido),
        verificadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Error verificando selfie:", error);

      // Cuando Rekognition no logra detectar NINGUNA cara en alguna de las
      // dos fotos, tira este error específico en vez de un porcentaje bajo.
      // Tiene sentido tratarlo como un rechazo automático directo: si no
      // hay una cara clara para comparar, obviamente no coincide.
      if (error?.name === "InvalidParameterException") {
        await ref.update({
          estadoVerificacion: "rechazado",
          parecidoSelfie: 0,
          verificadoEn: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      // Cualquier otro error (de red, de credenciales, etc.) sí queda
      // marcado como un error real para poder investigarlo.
      await ref.update({
        estadoVerificacion: "error_verificacion",
      });
    }
  }
);

/**
 * Notifica push cuando llega un mensaje nuevo, a la otra persona de la
 * conversación (nunca a quien lo escribió). Si esa persona no tiene un
 * token guardado (nunca aceptó las notificaciones, o las desactivó desde
 * el sistema), simplemente no se envía nada — no es un error.
 */
exports.notificarMensajeNuevo = onDocumentCreated(
  "conexiones/{conexionId}/mensajes/{mensajeId}",
  async (event) => {
    const mensaje = event.data.data();
    const { conexionId } = event.params;

    const conexionSnap = await admin.firestore().doc(`conexiones/${conexionId}`).get();
    if (!conexionSnap.exists) return;
    const destinatarioUid = (conexionSnap.data().usuarios || []).find(
      (u) => u !== mensaje.autorUid
    );
    if (!destinatarioUid) return;

    const [destinatarioSnap, autorSnap, destinatarioPrivado] = await Promise.all([
      admin.firestore().doc(`usuarios/${destinatarioUid}`).get(),
      admin.firestore().doc(`usuarios/${mensaje.autorUid}`).get(),
      datosPrivados(destinatarioUid),
    ]);
    const token = conRespaldo(destinatarioPrivado, destinatarioSnap.data() || {}, "fcmToken");
    if (!token) return;

    try {
      await admin.messaging().send({
        token,
        notification: {
          title: autorSnap.data()?.nombre || "Alguien",
          body: mensaje.texto,
        },
        data: { tipo: "mensaje", conexionId },
      });
    } catch (error) {
      // Un token puede quedar inválido (se desinstaló la app, cambió de
      // dispositivo, etc.) — no es un error real del sistema.
      console.error("No se pudo enviar la notificación de mensaje:", error);
    }
  }
);

/**
 * Notifica push a ambas personas cuando se crea (o se reactiva después de
 * un "deshacer match") un match nuevo. onDocumentWritten cubre los dos
 * casos: la creación real, y la reactivación que hace crearConexion() en
 * el cliente (que solo actualiza deshecho a false sobre el documento
 * existente en vez de crear uno nuevo) — sin esto, un reencuentro después
 * de deshacer un match no avisaría a nadie.
 */
exports.notificarMatchNuevo = onDocumentWritten(
  "conexiones/{conexionId}",
  async (event) => {
    const antes = event.data.before.exists ? event.data.before.data() : null;
    const despues = event.data.after.exists ? event.data.after.data() : null;
    if (!despues || despues.deshecho) return;

    const esNuevo = !antes;
    const esReactivado = antes && antes.deshecho === true;
    if (!esNuevo && !esReactivado) return;

    const usuarios = despues.usuarios || [];
    if (usuarios.length !== 2) return;

    const snaps = await Promise.all(
      usuarios.map((uid) => admin.firestore().doc(`usuarios/${uid}`).get())
    );
    const datos = snaps.map((s) => s.data() || {});
    const privados = await Promise.all(usuarios.map((uid) => datosPrivados(uid)));

    await Promise.all(
      usuarios.map(async (uid, i) => {
        const token = conRespaldo(privados[i], datos[i], "fcmToken");
        if (!token) return;
        const otroNombre = datos[1 - i].nombre || "Alguien";
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: "¡Nuevo match! 🎉",
              body: `Hiciste match con ${otroNombre}`,
            },
            data: { tipo: "match", conexionId: event.params.conexionId },
          });
        } catch (error) {
          console.error("No se pudo enviar la notificación de match:", error);
        }
      })
    );
  }
);

/**
 * Elimina la cuenta de quien la llama: perfil, activación, "me interesa" /
 * "más tarde" propios, fotos en Storage, y la cuenta de login. Corre como
 * Cloud Function (no borrado directo desde el cliente) para no exigir un
 * reinicio de sesión reciente (lo pide Firebase para borrar una cuenta) y
 * porque las reglas de Firestore no dejan borrar "intereses"/"pases" desde
 * el cliente a propósito.
 *
 * Deja intactas las conexiones (chats) y mensajes ya existentes con otras
 * personas — quedan como historial para ellas, solo que sin poder ver el
 * perfil de quien se fue (el cliente ya maneja ese caso mostrando "Alguien").
 * El borrado del documento de usuario y de la cuenta de Auth va al final,
 * en ese orden, para no dejar datos huérfanos si algo falla a mitad de camino.
 */
exports.eliminarCuenta = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const uid = request.auth.uid;
  const db = admin.firestore();

  for (const nombreColeccion of ["intereses", "pases"]) {
    const snap = await db.collection(nombreColeccion).where("desde", "==", uid).get();
    await Promise.all(snap.docs.map((documento) => documento.ref.delete()));
  }

  const bucket = admin.storage().bucket();
  await Promise.all([
    bucket.deleteFiles({ prefix: `fotos-perfil/${uid}/` }).catch(() => {}),
    bucket.deleteFiles({ prefix: `selfies-verificacion/${uid}/` }).catch(() => {}),
  ]);

  await db.doc(`activaciones/${uid}`).delete();

  // En Firestore, borrar un documento NO borra sus subcolecciones: hay que
  // hacerlo a mano y ANTES, porque después de borrar el padre ya no queda
  // ninguna referencia por dónde llegar a ellas.
  //
  // Sin esto, al eliminar la cuenta quedaban guardados para siempre la selfie
  // de verificación, el correo y el nombre y teléfono del contacto de
  // confianza — un tercero que ni siquiera usa la app. Es justo lo que la Ley
  // 21.719 llama derecho de supresión.
  //
  // Se recorre la subcolección entera en vez de borrar `privado/datos` por su
  // nombre, para que siga funcionando si mañana se agrega otro documento ahí.
  const privados = await db.collection(`usuarios/${uid}/privado`).get();
  await Promise.all(privados.docs.map((documento) => documento.ref.delete()));

  await db.doc(`usuarios/${uid}`).delete();
  await admin.auth().deleteUser(uid);

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Activación verificada en el servidor
//
// Antes, activarse era escribir directo el documento `activaciones/{uid}` desde
// la app, y las reglas solo comprobaban que fueras el dueño. La verificación
// por GPS vivía ENTERA en el cliente, así que alguien con conocimientos
// técnicos podía declarar que estaba en cualquier bar de Chile y ver a toda la
// gente activa ahí sin moverse de su casa — justo lo contrario de lo que
// promete AquíMatch.
//
// Ahora la app pide la activación acá y es el servidor el que decide: le
// pregunta a Google Places por los lugares que hay alrededor de las
// coordenadas recibidas y comprueba que el lugar elegido esté de verdad a
// menos de 120 metros. Nada de lo que manda el cliente sobre sí mismo (nombre,
// foto, género) se cree: eso se lee del perfil guardado.
//
// Sigue sin ser infalible — existen apps de GPS falso — pero pasa de "cualquiera
// puede" a "hay que esforzarse bastante".
// ---------------------------------------------------------------------------
const GOOGLE_PLACES_API_KEY = defineSecret("GOOGLE_PLACES_API_KEY");

// ---------------------------------------------------------------------------
// Estadísticas por local — contadores ANÓNIMOS
//
// `activaciones/{uid}` es un documento por persona que se sobreescribe en cada
// activación, así que la app solo sabe dónde está cada quien AHORA: de todo lo
// que pasó antes no queda rastro. Sin esto, el día que un dueño de local pague
// por ver sus patrones de actividad, su panel arrancaría vacío y habría que
// esperar meses a que se junten datos. Los datos de hoy no se recuperan mañana.
//
// Se guardan SOLO conteos: por local, por hora, por rango de edad. Nunca el
// uid ni nada que apunte a una persona. Guardar "quién estuvo en qué bar cada
// noche" sería el dato más sensible que esta app podría tener — declarable en
// la política de privacidad, con plazo de retención y borrable al eliminar la
// cuenta (Ley 21.719). Con contadores anónimos ese problema no existe, y para
// lo que el panel necesita —cuántos, no quiénes— alcanza igual.
// ---------------------------------------------------------------------------

const ZONA_HORARIA = "America/Santiago";

// El corte por hora tiene que ser en hora de Chile, no en UTC: si no, "viernes
// a las 22:00" caería en el sábado y todo el patrón semanal quedaría corrido.
// Se usa Intl y no un desfase fijo porque Chile cambia de horario dos veces al
// año.
function bucketHorario(fecha) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const dia = `${valor("year")}-${valor("month")}-${valor("day")}`;
  // El % 24 cubre los runtimes viejos que devuelven "24" a medianoche.
  const hora = Number(valor("hour")) % 24;
  // Mediodía UTC sobre una fecha que ya es la local: así ninguna zona horaria
  // puede correr el día al calcular a qué día de la semana corresponde.
  const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return { dia, hora, diaSemana };
}

// Recibe la edad ya calculada, no la fecha. Antes la calculaba de nuevo desde
// `perfil.fechaNacimiento`, que desde el 2026-09-04 ya no vive en el documento
// público: habría quedado siempre en null y las estadísticas del local se
// habrían quedado sin el corte por edad, en silencio y sin que nadie lo note.
function rangoEdad(edad) {
  if (typeof edad !== "number") return null;
  if (edad < 18) return null;
  if (edad <= 24) return "18-24";
  if (edad <= 34) return "25-34";
  if (edad <= 44) return "35-44";
  return "45+";
}

/**
 * Suma 1 al contador del local para esta hora. Nunca lanza: una estadística no
 * puede impedir que alguien se active.
 *
 * `activacionPrevia` sirve para no contar dos veces a la misma persona: si ya
 * estaba activa en este mismo local dentro de esta misma hora, no se suma.
 */
async function registrarEstadistica(placeId, placeName, edad, activacionPrevia) {
  try {
    // Este aviso existe porque ya pasó: se le mandó el objeto `perfil` entero
    // en vez de la edad, y como acá abajo los errores se tragan a propósito,
    // el fallo fue mudo durante días. Un contador que se equivoca en silencio
    // es peor que uno que se cae.
    if (typeof edad !== "number") {
      console.error("[registrarEstadistica] edad no es un número:", typeof edad);
    }
    const ahora = new Date();
    const { dia, hora, diaSemana } = bucketHorario(ahora);

    if (activacionPrevia && activacionPrevia.placeId === placeId && activacionPrevia.iniciadaEn) {
      const previa = bucketHorario(activacionPrevia.iniciadaEn.toDate());
      if (previa.dia === dia && previa.hora === hora) return;
    }

    const rango = rangoEdad(edad);
    const incremento = admin.firestore.FieldValue.increment(1);
    const datos = {
      placeId,
      placeName,
      dia,
      hora,
      diaSemana,
      total: incremento,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (rango) datos.rangos = { [rango]: incremento };

    await admin
      .firestore()
      .doc(`estadisticasLugar/${placeId}_${dia}-${String(hora).padStart(2, "0")}`)
      .set(datos, { merge: true });
  } catch (error) {
    console.error("[registrarEstadistica] no se pudo guardar:", error);
  }
}

// Tiene que coincidir con RADIO_BUSQUEDA_METROS de src/services/places.js.
const RADIO_ACTIVACION_METROS = 120;
// Freno de uso por persona (ver el comentario dentro de la función).
const VENTANA_LIMITE_MS = 60 * 60 * 1000;
const MAX_ACTIVACIONES_POR_VENTANA = 10;
const MAX_BUSQUEDAS_POR_VENTANA = 30;
// Verificaciones de selfie por persona y por hora. Es la operación más cara
// del sistema (dos descargas más una comparación de rostros en AWS) y la única
// que se dispara sola desde un campo que escribe el cliente. Ver el tope en
// verificarSelfie.
const MAX_VERIFICACIONES_POR_VENTANA = 8;
// Cuántos lugares cercanos se le mandan a la app.
//
// SUBIDO DE 2 A 8 EL 2026-09-07. Max fue a comer a Buenos Muchachos, en
// Bellavista, y su propia app no le mostró el local donde estaba: le ofreció
// otros dos.
//
// La causa: el punto que Google tiene de un local grande está en la entrada o
// en el centro del recinto, así que estando adentro puedes quedar a 60 metros
// de SU punto mientras dos locales chicos de al lado tienen el suyo a 20. Con
// solo dos en la lista, el lugar donde de verdad estás no aparece. En un barrio
// denso eso no es un caso raro, es lo normal — y Bellavista y Barrio Italia,
// los dos elegidos para lanzar, son exactamente eso.
//
// Mandar 6 no cuesta ni una consulta más: la búsqueda a Google ya devuelve
// hasta 20 y estábamos descartando 18 antes de mostrarlos. La app sigue
// mostrando 2 y esconde el resto detrás de "No es ninguno de estos", para no
// llenar la pantalla en el caso normal.
const MAX_LUGARES_MOSTRADOS = 6;
// Cuánto se reutiliza la respuesta de Google para la misma zona.
//
// Eran 5 minutos, y con eso cada tanda de gente que llegaba a un bar a lo largo
// de la noche volvía a pagar una consulta: 20 personas repartidas en la noche
// eran ~20 consultas por la misma esquina. Con 3 horas es 1. El costo deja de
// escalar con la cantidad de usuarios y pasa a escalar con zonas × noche, que
// es lo que hace viable crecer (ver la cuota diaria de Places, que es el techo
// que de verdad rompe la app un sábado).
//
// Por qué 3 horas y no más: un bar no se mueve, pero el nombre y la dirección
// de Places no tienen excepción de caché en los términos de Google — solo el
// place ID se puede guardar indefinidamente. Unas horas se sostiene como caché
// temporal de rendimiento; una base propia de locales, no. Y un error en una
// zona (como el de Bellavista) ahora dura lo que dure el caché, así que cuanto
// más corto, antes se corrige solo.
const DURACION_CACHE_MS = 3 * 60 * 60 * 1000;
// Cuenta de administración (maxherreraf018@gmail.com). Solo se usa para poder
// saltarse el caché al probar en la calle: sin esto, un arreglo en la búsqueda
// de lugares no se puede verificar en terreno hasta 3 horas después.
const ADMIN_UID = "SM1r3pWsTYU2soVHMUmOT1xzIfi2";
// Radio con el que se le pregunta a Google: más amplio que el anterior para no
// perder por unos metros un lugar que sí es válido (mismo criterio que usa el
// cliente para buscar).
const RADIO_CONSULTA_METROS = 200;

/**
 * Igual que contarUso, pero devuelve false en vez de lanzar.
 *
 * Hace falta porque contarUso lanza un HttpsError, y eso solo tiene sentido
 * cuando hay alguien esperando una respuesta. En un disparador de Firestore no
 * hay a quién responderle: lanzar solo haría que la función se reintentara.
 */
async function dentroDelLimite(ref, campoConteo, campoVentana, maximo, ventanaMs = VENTANA_LIMITE_MS) {
  const ahoraMs = Date.now();
  let permitido = true;
  await admin.firestore().runTransaction(async (transaccion) => {
    const datos = (await transaccion.get(ref)).data() || {};
    const enVentana = datos[campoVentana] && ahoraMs - datos[campoVentana] < ventanaMs;
    const usados = enVentana ? datos[campoConteo] || 0 : 0;
    if (usados >= maximo) {
      permitido = false;
      return;
    }
    transaccion.set(
      ref,
      {
        [campoConteo]: usados + 1,
        [campoVentana]: enVentana ? datos[campoVentana] : ahoraMs,
      },
      { merge: true }
    );
  });
  return permitido;
}

/**
 * Cuenta un uso dentro de una ventana de tiempo, de forma ATÓMICA.
 *
 * Antes esto era leer el contador y después escribirlo, en dos pasos: dos
 * llamadas simultáneas leían el mismo número y las dos se daban por debajo del
 * tope, así que el límite se podía superar mandando solicitudes en paralelo —
 * justo lo que haría alguien que quiere agotar la cuota de Places. Dentro de
 * una transacción, Firestore detecta el choque y reintenta la segunda, así que
 * el conteo queda bien.
 */
async function contarUso(ref, campoConteo, campoVentana, maximo, mensaje, ventanaMs = VENTANA_LIMITE_MS) {
  const ahoraMs = Date.now();
  await admin.firestore().runTransaction(async (transaccion) => {
    const datos = (await transaccion.get(ref)).data() || {};
    const enVentana =
      datos[campoVentana] && ahoraMs - datos[campoVentana] < ventanaMs;
    const usados = enVentana ? datos[campoConteo] || 0 : 0;
    if (usados >= maximo) {
      throw new HttpsError("resource-exhausted", mensaje);
    }
    transaccion.set(
      ref,
      {
        [campoConteo]: usados + 1,
        [campoVentana]: enVentana ? datos[campoVentana] : ahoraMs,
      },
      { merge: true }
    );
  });
}

// Edad a partir de "AAAA-M-D", que es como la guarda CreateProfile (el mes y
// el día pueden venir sin cero adelante). Devuelve null si no se puede
// calcular, y quien llama tiene que tratar eso como NO elegible: sin una fecha
// válida no hay forma de saber si es mayor de edad, y en la duda no se pasa.
/**
 * Lee los datos privados de un usuario (usuarios/{uid}/privado/datos).
 *
 * Desde el 2026-09-04 ahí viven la fecha de nacimiento, el token de
 * notificaciones y la lista de bloqueados: el documento público lo puede leer
 * cualquiera que conozca el uid, y el uid queda a la vista de todos los que
 * estén activados en el mismo lugar.
 *
 * Devuelve {} si el documento no existe todavía, que es el caso de las cuentas
 * que aún no pasaron por la mudanza.
 */
async function datosPrivados(uid) {
  const snap = await admin.firestore().doc(`usuarios/${uid}/privado/datos`).get();
  return snap.exists ? snap.data() || {} : {};
}

/**
 * Un campo que se está mudando: primero se busca donde va a vivir, y si
 * todavía no está ahí, donde vivía.
 *
 * El respaldo NO es opcional. Las Cloud Functions se despliegan al instante
 * para todos, pero la mudanza de cada cuenta ocurre recién la primera vez que
 * esa persona abre la app nueva. Sin respaldo, entre una cosa y la otra
 * quedarían sin notificaciones y —peor— sin poder activarse, porque el control
 * de los 18 años no encontraría la fecha y bloquearía a todo el mundo.
 *
 * Cuando ya no queden cuentas sin mudar, se puede borrar el respaldo.
 */
function conRespaldo(privados, publico, campo) {
  return privados[campo] !== undefined ? privados[campo] : publico[campo];
}

function calcularEdad(fechaNacimiento) {
  if (typeof fechaNacimiento !== "string") return null;
  const partes = fechaNacimiento.split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return null;
  const [anio, mes, dia] = partes;
  const nacimiento = new Date(Date.UTC(anio, mes - 1, dia));
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - anio;
  const mesesDeDiferencia = hoy.getUTCMonth() + 1 - mes;
  if (mesesDeDiferencia < 0 || (mesesDeDiferencia === 0 && hoy.getUTCDate() < dia)) edad--;
  return edad;
}

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Única llamada a Google Places en todo el proyecto. Antes esta consulta la
// hacía el teléfono, con la clave de API incrustada en el código publicado —
// cualquiera podía extraerla del APK y gastarla con cargo a la tarjeta de
// Max. Ahora vive acá, con la clave guardada como secreto del servidor, donde
// no la ve nadie.
async function consultarPlacesCercanos(lat, lng) {
  const respuesta = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY.value(),
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.types,places.formattedAddress",
      },
      body: JSON.stringify({
        includedTypes: ["bar", "night_club", "restaurant", "cafe", "pub"],
        // Sin esto Google ordena por POPULARIDAD y devuelve los locales más
        // famosos del sector en vez de los que tenés al lado.
        rankPreference: "DISTANCE",
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: RADIO_CONSULTA_METROS,
          },
        },
      }),
    }
  );
  if (!respuesta.ok) throw new Error(`Places respondió ${respuesta.status}`);
  return (await respuesta.json()).places || [];
}

// Agrupa coordenadas cercanas en la misma "zona" de caché, redondeando a
// ~100m: diez personas activándose en el mismo bar en pocos minutos generan
// una sola consulta pagada a Google en vez de diez.
function idZonaCache(lat, lng) {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

/**
 * Busca los lugares donde la persona puede activarse.
 *
 * La consulta se centra en el CENTRO de la zona de caché, no en las
 * coordenadas exactas de quien pregunta, para que el resultado guardado sirva
 * igual de bien a cualquiera de esa zona. El límite real de 120 metros se
 * aplica después, contra las coordenadas exactas de cada persona.
 */
// Cuánto vale la ficha guardada de un local antes de volver a preguntarle a
// Google. Los términos de Google permiten guardar el identificador del lugar
// para siempre, pero no su nombre ni su ubicación: eso hay que refrescarlo. Un
// mes es el plazo habitual, y un bar no se muda en ese tiempo.
const VIGENCIA_LUGAR_MS = 30 * 24 * 60 * 60 * 1000;

// Cuánto se conservan los registros de "me interesa" y "más tarde".
const DIAS_RETENCION_ENCUENTROS = 90;
// Tope por colección y por corrida, para que una limpieza atrasada no se
// quede sin tiempo ni dispare una factura de escrituras de golpe. Corre todos
// los días: si un día no alcanza, al siguiente sigue donde quedó.
const MAX_BORRADOS_POR_CORRIDA = 2000;

/**
 * Borra los registros de encuentro que ya no sirven para nada.
 *
 * POR QUÉ EXISTE. Cada documento de `intereses` y de `pases` dice "estas dos
 * personas estuvieron en el mismo lugar este día". Guardados para siempre,
 * juntos arman un mapa de quién se cruzó con quién y dónde — exactamente lo
 * que la app promete no construir, y justo el tipo de dato que la Ley 21.719
 * mira con lupa a partir de diciembre de 2026.
 *
 * Y no sirven pasado un tiempo: se usan para esconder a alguien 10 minutos
 * después de un "más tarde", y para ordenar la lista de Descubrir. Un registro
 * de hace tres meses no cumple ninguna de las dos cosas.
 *
 * QUÉ NO SE TOCA: `estadisticasLugar`. Ahí no hay ningún identificador de
 * nadie —solo cuántas personas hubo en tal local a tal hora— y es la materia
 * prima del panel para dueños de locales, que necesita meses de historia. Esa
 * historia no se recupera después. No borrarla.
 *
 * Efecto secundario, y es el correcto: a alguien a quien pasaste hace tres
 * meses vuelves a verlo como si fuera nuevo.
 */
exports.limpiarEncuentrosViejos = onSchedule(
  { schedule: "every day 04:30", timeZone: "America/Santiago" },
  async () => {
    const corte = admin.firestore.Timestamp.fromMillis(
      Date.now() - DIAS_RETENCION_ENCUENTROS * 24 * 60 * 60 * 1000
    );

    for (const coleccion of ["intereses", "pases"]) {
      let borrados = 0;
      // De a tandas: `limit` acota cada consulta y el bucle corta al llegar al
      // tope o cuando ya no queda nada viejo.
      while (borrados < MAX_BORRADOS_POR_CORRIDA) {
        const tanda = await admin
          .firestore()
          .collection(coleccion)
          .where("creadoEn", "<", corte)
          .limit(400)
          .get();
        if (tanda.empty) break;

        const lote = admin.firestore().batch();
        tanda.docs.forEach((d) => lote.delete(d.ref));
        await lote.commit();
        borrados += tanda.size;
      }
      console.log(`[limpiarEncuentrosViejos] ${coleccion}: ${borrados} borrados`);
    }
  }
);

/**
 * Devuelve la selfie de alguien para que el panel de moderación pueda verla.
 *
 * La manda como imagen incrustada, no como una dirección.
 *
 * POR QUÉ ASÍ Y NO CON UN ENLACE FIRMADO, que fue el primer intento: la cuenta
 * con la que corren estas funciones no tiene permiso para firmar enlaces
 * (`iam.serviceAccounts.signBlob` denied, medido en los registros el
 * 2026-09-07). Concederlo obliga a tocar permisos en la consola de Google
 * Cloud, que es justo el tipo de paso manual que después nadie recuerda haber
 * hecho cuando algo se rompe.
 *
 * Y mandarla incrustada es además MÁS seguro: no llega a existir ninguna
 * dirección descargable de un dato biométrico, ni siquiera una que se venza.
 * La imagen viaja dentro de la respuesta, solo para el administrador que la
 * pidió, y desaparece al cerrar la pantalla.
 *
 * El costo es el tamaño: una selfie ronda los 200 KB y va en texto, que pesa un
 * tercio más. Para una pantalla que muestra unos pocos perfiles a la vez, es
 * irrelevante.
 */
exports.urlSelfieModeracion = onCall(async (request) => {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Solo el panel de moderación.");
  }
  const uid = request.data?.uid;
  if (typeof uid !== "string" || !uid) {
    throw new HttpsError("invalid-argument", "Falta el uid.");
  }

  const snap = await admin.firestore().doc(`usuarios/${uid}/privado/datos`).get();
  const datos = snap.exists ? snap.data() : {};

  // Las cuentas que subieron su selfie con una app anterior tienen una URL
  // guardada; esa se devuelve tal cual, porque su archivo sí tiene token.
  if (!datos.selfieRuta) return { url: datos.selfieVerificacion || null };

  try {
    const bytes = await leerSelfieDelBucket(uid);
    return { url: `data:image/jpeg;base64,${bytes.toString("base64")}` };
  } catch (error) {
    // Si el archivo ya no está (cuenta borrada a medias, por ejemplo), el
    // panel muestra el recuadro vacío en vez de romperse entero.
    console.error("[urlSelfieModeracion] no se pudo leer la selfie:", error);
    return { url: null };
  }
});

exports.buscarLugares = onCall(
  { secrets: [GOOGLE_PLACES_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const uid = request.auth.uid;
    const { lat, lng, sinCache } = request.data || {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpsError("invalid-argument", "Faltan las coordenadas.");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new HttpsError("invalid-argument", "Coordenadas fuera de rango.");
    }
    // Solo la cuenta de administración puede pedir datos frescos. Si esto fuera
    // abierto, cualquiera podría vaciar la cuota diaria de Places pidiendo
    // siempre sin caché, que es justo lo que el caché evita.
    const omitirCache = sinCache === true && uid === ADMIN_UID;

    // Freno por persona: cada búsqueda sin caché gasta una consulta pagada.
    // Buscar es más frecuente que activarse (se puede reintentar), así que el
    // tope es más alto que el de activarEnLugar.
    const ahoraMs = Date.now();
    await contarUso(
      admin.firestore().doc(`limites/${uid}`),
      "busquedas",
      "ventanaBusquedasEn",
      MAX_BUSQUEDAS_POR_VENTANA,
      "Hiciste demasiadas búsquedas seguidas. Espera un rato."
    );

    const zonaId = idZonaCache(lat, lng);
    const refCache = admin.firestore().doc(`cachePlaces/${zonaId}`);
    let lugares = null;

    if (!omitirCache) {
      const cache = (await refCache.get()).data();
      if (cache?.actualizadoEnMs && ahoraMs - cache.actualizadoEnMs < DURACION_CACHE_MS) {
        lugares = cache.lugares;
      }
    }

    if (!lugares) {
      let crudos;
      try {
        crudos = await consultarPlacesCercanos(
          Number(lat.toFixed(3)),
          Number(lng.toFixed(3))
        );
      } catch (error) {
        console.error("[buscarLugares] error consultando Places:", error);
        throw new HttpsError("unavailable", "No pudimos buscar lugares. Intenta de nuevo.");
      }
      lugares = crudos.map((p) => ({
        placeId: p.id,
        nombre: p.displayName?.text || "Lugar sin nombre",
        direccion: p.formattedAddress || "",
        tipos: p.types || [],
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      }));
      // El caché ya no lo puede tocar el cliente (ver firestore.rules): antes
      // cualquiera podía inyectar lugares falsos que aparecían en la pantalla
      // "¿Dónde estás?" de otras personas.
      // `expiraEn` no lo lee el código: existe para que Firestore borre solo el
      // documento (política de TTL sobre este campo, se activa en la consola).
      // Sin eso quedaría una entrada por cada celda de ~100 m que alguien haya
      // visitado alguna vez, creciendo para siempre.
      await refCache
        .set({
          lugares,
          actualizadoEnMs: ahoraMs,
          expiraEn: admin.firestore.Timestamp.fromMillis(ahoraMs + DURACION_CACHE_MS),
        })
        .catch(() => {});
    }

    return lugares
      .map((l) => ({ ...l, distanciaMetros: distanciaMetros(lat, lng, l.lat, l.lng) }))
      .filter((l) => l.distanciaMetros <= RADIO_ACTIVACION_METROS)
      .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
      .slice(0, MAX_LUGARES_MOSTRADOS);
  }
);

exports.activarEnLugar = onCall(
  { secrets: [GOOGLE_PLACES_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const uid = request.auth.uid;
    const { lat, lng, placeId } = request.data || {};

    if (typeof lat !== "number" || typeof lng !== "number" || !placeId) {
      throw new HttpsError("invalid-argument", "Faltan datos de ubicación.");
    }

    // Límite de uso por persona. Cada llamada gasta una consulta a Google
    // Places, y la cuota diaria del proyecto está en 1.000: sin este freno,
    // cualquier usuario registrado podía llamar mil veces en unos minutos,
    // agotarla, y dejar a TODO el mundo sin poder encontrar lugares hasta la
    // medianoche. Activarse de verdad se hace una vez por salida, así que 10
    // por hora es holgadísimo para el uso real y mata el abuso.
    const ahoraMs = Date.now();
    await contarUso(
      admin.firestore().doc(`limites/${uid}`),
      "intentos",
      "ventanaIniciadaEn",
      MAX_ACTIVACIONES_POR_VENTANA,
      "Hiciste demasiados intentos seguidos. Espera un rato antes de volver a activarte."
    );
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new HttpsError("invalid-argument", "Coordenadas fuera de rango.");
    }

    // 1. El lugar elegido tiene que ser uno de los que hay realmente alrededor
    //    de esas coordenadas.
    //
    //    Se mira PRIMERO el caché de zona que dejó buscarLugares. La persona
    //    acaba de buscar para poder elegir el local, así que esa consulta ya se
    //    pagó hace segundos. Antes acá se le preguntaba a Google de nuevo en
    //    cada activación: dos consultas pagadas por salida en vez de una, y era
    //    la mitad del gasto de Places que el caché de búsquedas no tocaba.
    //
    //    Que los datos sean de hace un rato no debilita la comprobación: un bar
    //    no se mueve, y el candado real es el paso 2, que mide la distancia
    //    contra las coordenadas que manda el teléfono AHORA.
    //
    //    Si el lugar no está en el caché, se le pregunta a Google igual que
    //    siempre ANTES de rechazar a nadie. Eso es lo que impide reintroducir
    //    el falso rechazo tipo Bellavista: si el caché de esa celda quedó
    //    incompleto, la persona igual se puede activar estando adentro.
    let lugar = null;
    const zonaId = idZonaCache(lat, lng);
    const cache = (await admin.firestore().doc(`cachePlaces/${zonaId}`).get()).data();
    if (cache?.actualizadoEnMs && ahoraMs - cache.actualizadoEnMs < DURACION_CACHE_MS) {
      const enCache = (cache.lugares || []).find((l) => l.placeId === placeId);
      if (enCache) {
        lugar = {
          nombre: enCache.nombre || "",
          lat: enCache.lat,
          lng: enCache.lng,
          tipos: enCache.tipos || [],
        };
      }
    }
    // Segundo intento antes de gastar una consulta: la ficha del local que ya
    // guardamos la primera vez que alguien se activó ahí.
    //
    // Esto es lo que hace posible el atajo "¿estás en Fortunato otra vez?": si
    // el servidor no tuviera su propia copia de las coordenadas, tendría que
    // creerle al teléfono — y un teléfono modificado diría "estoy en Fortunato
    // y Fortunato queda justo donde estoy yo". La comprobación de los 120
    // metros solo vale si las coordenadas del local las pone el servidor.
    //
    // Se refresca cada 30 días porque los términos de Google permiten guardar
    // el identificador del lugar para siempre, pero no su nombre ni su
    // ubicación. Un bar tampoco se muda en un mes.
    let vinoDeFichaGuardada = false;
    if (!lugar) {
      const conocido = (
        await admin.firestore().doc(`lugaresConocidos/${placeId}`).get()
      ).data();
      if (conocido?.obtenidoDeGoogleEnMs && ahoraMs - conocido.obtenidoDeGoogleEnMs < VIGENCIA_LUGAR_MS) {
        lugar = {
          nombre: conocido.nombre || "",
          lat: conocido.lat,
          lng: conocido.lng,
          tipos: conocido.tipos || [],
        };
        vinoDeFichaGuardada = true;
      }
    }

    if (!lugar) {
      let lugares = [];
      try {
        // Misma consulta que usa buscarLugares: una sola implementación, para
        // que el radio y los tipos de lugar no se puedan desincronizar.
        lugares = await consultarPlacesCercanos(lat, lng);
      } catch (error) {
        console.error("[activarEnLugar] error consultando Places:", error);
        throw new HttpsError("unavailable", "No pudimos verificar tu ubicación. Intenta de nuevo.");
      }
      const crudo = lugares.find((p) => p.id === placeId);
      if (!crudo) {
        throw new HttpsError(
          "permission-denied",
          "No pudimos confirmar que estés en ese lugar. Acércate a la entrada e intenta de nuevo."
        );
      }
      lugar = {
        nombre: crudo.displayName?.text || "",
        lat: crudo.location?.latitude,
        lng: crudo.location?.longitude,
        tipos: crudo.types || [],
      };
    }

    // 2. Y tiene que estar a menos de 120 metros de verdad. Este es el candado
    //    real, y se calcula siempre contra las coordenadas que manda el
    //    teléfono en esta llamada, vengan los datos del lugar del caché o de
    //    una consulta fresca.
    const distancia = distanciaMetros(lat, lng, lugar.lat, lugar.lng);
    if (!(distancia <= RADIO_ACTIVACION_METROS)) {
      throw new HttpsError(
        "permission-denied",
        "Estás demasiado lejos de ese lugar para activarte."
      );
    }

    // Se guarda la ficha del local para las próximas veces, de cualquiera.
    //
    // Es información de un bar —nombre y coordenadas—, no de ninguna persona:
    // por eso puede ser compartida. El historial de quién va a dónde NO se
    // guarda acá ni en ningún lado; esa lista vive solo en el teléfono de cada
    // uno. Ver el atajo de lugares en la app.
    //
    // SOLO SE ESCRIBE SI EL DATO VINO DE GOOGLE. Si vino de la ficha guardada,
    // reescribirla renovaría su fecha, y un local visitado una vez al mes no
    // caducaría NUNCA: los datos de Google quedarían guardados para siempre,
    // que es justo lo que sus términos no permiten. El campo se llama
    // `obtenidoDeGoogleEnMs` y no "actualizadoEn" para que quede dicho que mide
    // la edad del dato, no la última vez que se usó.
    //
    // No se espera a que termine: si falla, lo único que pasa es que la próxima
    // activación en ese local gasta una consulta a Google.
    if (!vinoDeFichaGuardada) {
      admin
        .firestore()
        .doc(`lugaresConocidos/${placeId}`)
        .set(
          {
            nombre: lugar.nombre || "",
            lat: lugar.lat,
            lng: lugar.lng,
            tipos: lugar.tipos || [],
            obtenidoDeGoogleEnMs: ahoraMs,
          },
          { merge: true }
        )
        .catch(() => {});
    }

    // 4. Los datos propios se leen del perfil guardado, nunca de lo que mande
    //    el cliente: si no, cualquiera podría activarse con el nombre y la
    //    foto de otra persona.
    //    La activación previa se lee ACÁ, antes del .set() de más abajo que la
    //    sobreescribe: es lo único que permite saber si esta persona ya estaba
    //    en este mismo local en esta misma hora, y así no contarla dos veces en
    //    las estadísticas.
    const [perfilSnap, activacionPreviaSnap] = await Promise.all([
      admin.firestore().doc(`usuarios/${uid}`).get(),
      admin.firestore().doc(`activaciones/${uid}`).get(),
    ]);
    if (!perfilSnap.exists) {
      throw new HttpsError("failed-precondition", "Todavía no tienes perfil.");
    }
    const perfil = perfilSnap.data();

    // Lista blanca, no lista negra. Antes se rechazaban SOLO "pendiente" y
    // "rechazado", así que dejaba pasar cualquier otro valor — y sobre todo,
    // dejaba pasar cuando el campo NO EXISTÍA. Alcanzaba con crear el
    // documento de usuario directamente contra Firebase, sin pasar nunca por
    // la app, para activarse en un lugar sin haber subido una selfie. También
    // pasaban "falta_foto" y "error_verificacion", que son estados de gente
    // que justamente NO terminó de verificarse.
    //
    // Regla general que conviene mantener: una cuenta en un estado que no
    // reconocemos se trata como bloqueada, nunca como aprobada.
    if (perfil.estadoVerificacion !== "aprobado") {
      throw new HttpsError("failed-precondition", "Tu perfil todavía no está verificado.");
    }
    if (perfil.perfilCompleto !== true) {
      throw new HttpsError("failed-precondition", "Todavía no completaste tu perfil.");
    }
    if (perfil.suspendido === true) {
      throw new HttpsError("permission-denied", "Tu cuenta está suspendida.");
    }
    // El control de los 18 años vivía solo en la pantalla de registro, o sea
    // en el cliente: quien escribiera su perfil por fuera de la app se lo
    // saltaba entero. Acá se recalcula contra la fecha guardada, y sin fecha
    // válida no se activa nadie.
    //
    // La fecha se mudó a los datos privados el 2026-09-04. Se lee de los dos
    // lados mientras dure la mudanza: si solo se mirara el nuevo, todas las
    // cuentas que aún no se mudaron se quedarían sin poder activarse.
    const privadoPropio = await datosPrivados(uid);
    const edad = calcularEdad(conRespaldo(privadoPropio, perfil, "fechaNacimiento"));
    if (edad === null || edad < 18) {
      throw new HttpsError("failed-precondition", "AquiMatch es solo para mayores de 18 años.");
    }

    // La edad que ven los demás en las tarjetas. Se publica desde acá, y no
    // desde la app, porque las reglas no dejan que el cliente la escriba: si
    // pudiera, cualquiera se pondría la edad que quisiera.
    //
    // Este es el momento correcto para hacerlo: solo aparecés ante otras
    // personas estando activo, así que para cuando alguien te ve, el número ya
    // está puesto y al día. Se escribe solo si cambió, para no gastar una
    // escritura en cada activación.
    if (perfil.edad !== edad) {
      await perfilSnap.ref.update({ edad });
    }

    await admin.firestore().doc(`activaciones/${uid}`).set({
      uid,
      nombre: perfil.nombre || "",
      fotoPrincipal: perfil.fotoPrincipal || "",
      genero: perfil.genero || "",
      preferenciaGenero: perfil.preferenciaGenero || "ambos",
      placeId,
      placeName: lugar.nombre,
      lat: lugar.lat,
      lng: lugar.lng,
      tipos: lugar.tipos,
      // Se guarda para poder mostrarla en la app ("ubicación confirmada, a 40
      // metros"). El servidor ya la calculó para decidir si dejaba activarse;
      // no tiene sentido que el teléfono la vuelva a calcular por su cuenta.
      distanciaMetros: Math.round(distancia),
      activa: true,
      // "participar" por defecto, no null.
      //
      // Antes nacía en null y la app lo cambiaba a "participar" o "explorar"
      // un segundo después, al confirmar el lugar. Eso dejaba un hueco: entre
      // la activación y la elección, el campo no decía nada.
      //
      // Importa porque a partir de ahora quién se ve y quién no se decide
      // MIRANDO ESTE CAMPO, en el servidor, y no filtrando en la pantalla. Un
      // valor nulo obligaría a preguntar "distinto de explorar", y las
      // consultas por desigualdad de Firestore tratan los nulos de una forma
      // que es fácil equivocarse. Con un valor explícito, la consulta es una
      // igualdad simple y no hay nada que interpretar.
      //
      // Y nace en "pendiente", NO en "participar": entre que el servidor crea
      // la activación y la persona elige participar o explorar pasan unos
      // segundos, y arrancar en "participar" significaría aparecerle a todo el
      // local antes de haber decidido si querías aparecer. Con "pendiente" no
      // te ve nadie hasta que lo digas. Si algo falla en el camino, el error
      // te deja invisible en vez de expuesto, que es el lado correcto para
      // equivocarse.
      modo: "pendiente",
      pausadoHasta: null,
      pausaUsada: false,
      // Deja constancia de que esta activación pasó por la verificación del
      // servidor. Cuando ya nadie use una versión vieja de la app, las reglas
      // pueden exigir que exista.
      verificadaEnServidor: true,
      iniciadaEn: admin.firestore.FieldValue.serverTimestamp(),
      actualizadaEn: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Se espera a que termine (y no se deja "suelta") porque en Cloud
    // Functions el proceso se puede congelar apenas la función devuelve, y una
    // escritura a medias no se completaría. Igual no puede tumbar la
    // activación: registrarEstadistica se traga sus propios errores.
    await registrarEstadistica(
      placeId,
      lugar.nombre,
      // `edad`, no `perfil`. Cuando rangoEdad() pasó a recibir la edad ya
      // calculada en vez de la fecha de nacimiento, esta llamada se quedó
      // mandando el objeto entero. rangoEdad() devuelve null ante cualquier
      // cosa que no sea un número, y como registrarEstadistica se traga sus
      // errores a propósito, no falló nada: simplemente NUNCA se guardó un
      // solo rango de edad. El desglose del panel del dueño llevaba desde
      // entonces leyendo un dato que no se estaba escribiendo.
      edad,
      activacionPreviaSnap.exists ? activacionPreviaSnap.data() : null
    );

    return {
      placeId,
      placeName: lugar.nombre,
      lat: lugar.lat,
      lng: lugar.lng,
      tipos: lugar.tipos,
    };
  }
);

// ---------------------------------------------------------------------------
// Panel para dueños de locales
//
// El panel vive en una web aparte, no dentro de la app: si el dueño pagara la
// suscripción dentro de la app, Apple y Google podrían exigir su sistema de
// compras y quedarse con 15-30% para siempre.
//
// Los datos NO se leen directo desde el navegador del dueño, aunque las reglas
// podrían permitirlo. Van por estas funciones a propósito, por dos motivos:
//
//   1. El umbral de anonimato tiene que aplicarse en el servidor. Si se
//      escondieran las franjas con poca gente solo en la pantalla, cualquiera
//      abriría la consola del navegador y vería los números reales. En un bar
//      con dos clientes, "2 personas, 25-34" empieza a ser identificable.
//   2. Comprobar en las reglas que quien consulta es el dueño de ese local
//      obligaría a leer el documento del local por cada bucket devuelto, y eso
//      se cobra. Acá se comprueba una sola vez.
// ---------------------------------------------------------------------------

// Por debajo de esto no se muestra el desglose de una franja: con muy poca
// gente, un rango de edad deja de ser una estadística y pasa a señalar a una
// persona concreta.
const MINIMO_PARA_MOSTRAR = 5;
// Rangos que puede elegir el dueño. Lista cerrada a propósito: si el cliente
// pudiera mandar cualquier número, alguien pediría 3650 días y la consulta se
// llevaría media colección por delante.
const RANGOS_DIAS = [7, 14, 30, 60];
const DIAS_POR_DEFECTO = 30;
// Cuánto puede llevar una activación sin renovarse antes de darla por
// abandonada. Tiene que ser el MISMO número que UMBRAL_INACTIVIDAD_MS en
// src/services/activation.js: si el panel usara otro, el dueño vería una
// cantidad de gente distinta de la que ve en la app cualquiera que esté ahí
// parado. Si se cambia allá, hay que cambiarlo acá.
const UMBRAL_INACTIVIDAD_MS = 3 * 60 * 60 * 1000;

function fechaISOChile(fecha) {
  return bucketHorario(fecha).dia;
}

/**
 * Enlaza la cuenta de usuario recién creada por el dueño con la cuenta de
 * local que ya se le había creado a mano desde el panel de moderación.
 *
 * El enlace se hace por correo verificado: al crear la cuenta del local se
 * anota el correo del responsable, y cuando esa persona entra por primera vez
 * al panel con ese mismo correo, se guarda su uid. Se exige el correo
 * verificado porque si no, cualquiera podría registrarse con el correo de un
 * dueño y quedarse con el acceso a su local.
 */
exports.vincularCuentaLocal = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Necesitas iniciar sesión.");

  const usuario = await admin.auth().getUser(uid);
  if (!usuario.emailVerified) {
    throw new HttpsError("failed-precondition", "Primero verifica tu correo.");
  }
  const correo = (usuario.email || "").trim().toLowerCase();
  if (!correo) throw new HttpsError("failed-precondition", "Tu cuenta no tiene correo.");

  const db = admin.firestore();

  // Si ya estaba enlazada, no hay nada que hacer.
  const yaEnlazado = await db.collection("locales").where("responsableUid", "==", uid).limit(1).get();
  if (!yaEnlazado.empty) return { placeId: yaEnlazado.docs[0].id };

  const porCorreo = await db
    .collection("locales")
    .where("responsableCorreo", "==", correo)
    .where("responsableUid", "==", null)
    .limit(1)
    .get();
  if (porCorreo.empty) {
    throw new HttpsError("not-found", "No encontramos ningún local asociado a este correo.");
  }

  await porCorreo.docs[0].ref.update({
    responsableUid: uid,
    actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { placeId: porCorreo.docs[0].id };
});

/**
 * Datos del panel: cuánta gente hay ahora, y los patrones por día y hora.
 * Devuelve solo conteos agregados — nunca perfiles, fotos ni nombres de las
 * personas que están en el local.
 */
// Largo máximo de un aviso. Es un cartel, no un correo: si no cabe en dos
// líneas de la pantalla de alguien que está conversando en un bar, no lo lee.
const MAX_LARGO_AVISO = 140;
// Cuánto tiempo sigue a la vista un aviso. Habla de lo que pasa AHORA en el
// local, así que a las 3 horas ya no significa nada — es el mismo plazo con el
// que se considera que alguien se fue del lugar.
const VIGENCIA_AVISO_MS = 3 * 60 * 60 * 1000;
// Tope por local: 4 avisos cada 6 horas, que en la práctica es "cuatro por
// noche".
//
// EMPEZÓ EN 3 POR HORA Y ESTABA MAL CALIBRADO: en una noche de cinco horas eso
// daba hasta 15 avisos. Quince mensajes a alguien que está tomando algo en un
// bar es acoso, no promoción — y quien desinstala la app no lo hace por el bar,
// lo hace por AquíMatch. El daño no lo paga el dueño.
//
// Cuatro alcanza de sobra para el uso real: el 2x1 al llegar, el aviso de la
// última hora, y algo al cierre. De ahí para arriba, ya no está promocionando.
const MAX_AVISOS_POR_VENTANA = 4;
const VENTANA_AVISOS_MS = 6 * 60 * 60 * 1000;

/**
 * El dueño de un local le manda un aviso corto a quienes están activados ahí
 * en ese momento: "2x1 en cervezas para los que estén conectados".
 *
 * Es la primera función del panel que sirve para ACTUAR y no solo para mirar,
 * y Max la puso como la número uno por encima de los datos. Su razón, que es
 * correcta: un dueño no compra un tablero, compra poder llenar un martes
 * flojo. Y es también el mecanismo de crecimiento — el local le habla a su
 * propia clientela, que es justo la gente que queremos.
 *
 * LÍMITE QUE HAY QUE DECIR DE FRENTE AL VENDER: llega solo a quien está
 * activado en el local en ese momento. No es una notificación al que pasa por
 * la calle, ni al que fue la semana pasada. Eso último necesita gente cerca y
 * llega después.
 */
exports.mandarAviso = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Necesitas iniciar sesión.");

  const texto = String(request.data?.texto || "").trim();
  if (!texto) throw new HttpsError("invalid-argument", "Escribe el aviso.");
  if (texto.length > MAX_LARGO_AVISO) {
    throw new HttpsError("invalid-argument", `El aviso no puede pasar de ${MAX_LARGO_AVISO} caracteres.`);
  }

  const db = admin.firestore();
  const locales = await db.collection("locales").where("responsableUid", "==", uid).limit(1).get();
  if (locales.empty) {
    throw new HttpsError("permission-denied", "Tu cuenta no administra ningún local.");
  }
  const local = { placeId: locales.docs[0].id, ...locales.docs[0].data() };
  if (local.estado !== "verificado" || local.nivel !== "reforzado") {
    throw new HttpsError(
      "permission-denied",
      "Tu cuenta todavía no tiene habilitado el envío de avisos."
    );
  }

  await contarUso(
    db.doc(`limites/local_${local.placeId}`),
    "avisos",
    "ventanaAvisos",
    MAX_AVISOS_POR_VENTANA,
    "Ya mandaste varios avisos hoy. Espera un rato antes del siguiente.",
    VENTANA_AVISOS_MS
  );

  const ahoraMs = Date.now();
  const documento = await db.collection("avisos").add({
    placeId: local.placeId,
    nombreLocal: local.placeName || "",
    texto,
    // Se guarda quién lo mandó para poder rastrear un abuso hasta una cuenta
    // concreta. No se le muestra a nadie.
    autorUid: uid,
    creadoEnMs: ahoraMs,
    expiraEn: admin.firestore.Timestamp.fromMillis(ahoraMs + VIGENCIA_AVISO_MS),
  });

  return { id: documento.id };
});

exports.estadisticasDelLocal = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Necesitas iniciar sesión.");

  const db = admin.firestore();
  const locales = await db.collection("locales").where("responsableUid", "==", uid).limit(1).get();
  if (locales.empty) {
    throw new HttpsError("permission-denied", "Tu cuenta no administra ningún local.");
  }
  const local = { placeId: locales.docs[0].id, ...locales.docs[0].data() };
  if (local.estado !== "verificado" || local.nivel === "ninguno") {
    throw new HttpsError("permission-denied", "Tu cuenta no tiene acceso a las estadísticas.");
  }

  const dias = RANGOS_DIAS.includes(request.data?.dias) ? request.data.dias : DIAS_POR_DEFECTO;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const buckets = await db
    .collection("estadisticasLugar")
    .where("placeId", "==", local.placeId)
    .where("dia", ">=", fechaISOChile(desde))
    .get();

  // Escaneos del QR en el mismo período. Es lo que le permite al dueño saber
  // si su cartel sirvió de algo, y a nosotros saber qué local trae gente de
  // verdad. Van en su propia colección: un escaneo es interés, una activación
  // es una persona sentada en una mesa, y confundirlos arruinaría el dato.
  const escaneos = await db
    .collection("escaneosLugar")
    .where("placeId", "==", local.placeId)
    .where("dia", ">=", fechaISOChile(desde))
    .get();
  const totalEscaneos = escaneos.docs.reduce((suma, d) => suma + (d.data().total || 0), 0);

  // Cuánta gente hay AHORA en el local.
  //
  // Antes este número salía del bucket de la hora en curso de
  // estadisticasLugar, y mentía de dos maneras distintas:
  //
  //   - Contaba activaciones, no presencia. Seis personas que activaron a las
  //     22:05 y se fueron a las 22:20 seguían sumando a las 22:50.
  //   - Se reiniciaba en cada hora en punto. A las 23:01 un local lleno
  //     mostraba "menos de 5", porque el bucket de las 23 tenía un minuto de
  //     vida.
  //
  // Ahora se cuenta exactamente lo mismo que cuenta la app para decidir quién
  // está en la sala: activaciones vivas y renovadas hace menos de
  // UMBRAL_INACTIVIDAD_MS. Los documentos traen nombre y foto, pero se leen y
  // se descartan acá dentro: de la función sale un número y nada más.
  const activaciones = await db
    .collection("activaciones")
    .where("placeId", "==", local.placeId)
    .where("activa", "==", true)
    .get();
  const limiteFrescura = Date.now() - UMBRAL_INACTIVIDAD_MS;
  const activosAhora = activaciones.docs.filter((documento) => {
    const a = documento.data();
    const referencia = a.actualizadaEn || a.iniciadaEn;
    return referencia ? referencia.toMillis() >= limiteFrescura : false;
  }).length;

  // Matriz día de la semana x hora, para encontrar la mejor franja.
  const porFranja = new Map();
  const porRango = { "18-24": 0, "25-34": 0, "35-44": 0, "45+": 0 };
  const porDia = new Map();
  let totalPeriodo = 0;

  buckets.docs.forEach((documento) => {
    const b = documento.data();
    const total = b.total || 0;
    totalPeriodo += total;
    porDia.set(b.dia, (porDia.get(b.dia) || 0) + total);

    const clave = `${b.diaSemana}-${b.hora}`;
    const franja = porFranja.get(clave) || { diaSemana: b.diaSemana, hora: b.hora, total: 0, veces: 0 };
    franja.total += total;
    franja.veces += 1;
    porFranja.set(clave, franja);

    Object.entries(b.rangos || {}).forEach(([rango, cantidad]) => {
      if (porRango[rango] !== undefined) porRango[rango] += cantidad;
    });
  });

  // Promedio por ocurrencia, no suma total: si no, un viernes que se repitió 8
  // veces siempre le gana a un sábado que se repitió 2, aunque el sábado tenga
  // más gente cada vez.
  const franjas = [...porFranja.values()]
    .map((f) => ({ ...f, promedio: f.total / f.veces }))
    .sort((a, b) => b.promedio - a.promedio);

  // El umbral de anonimato hay que aplicarlo RANGO POR RANGO, no al total.
  // Aplicado al total, un local con 5 personas —suficiente para pasar el
  // filtro— podía mostrar "18-24: 4, 45+: 1", y ese 1 es una persona concreta
  // a la que el dueño vio entrar. Lo que sale ahora es cero para los rangos
  // flacos, y la suma de todos ellos junta en `ocultosPorRango`: "3 personas
  // en rangos con muy poca gente" no señala a nadie.
  const rangosPublicables = {};
  let ocultosPorRango = 0;
  Object.entries(porRango).forEach(([rango, cantidad]) => {
    if (cantidad >= MINIMO_PARA_MOSTRAR) {
      rangosPublicables[rango] = cantidad;
    } else {
      rangosPublicables[rango] = 0;
      ocultosPorRango += cantidad;
    }
  });

  const mejor = franjas[0] || null;
  // Referencia para el "X veces más": el promedio de todas las franjas que
  // tuvieron algo de actividad.
  const promedioGeneral =
    franjas.length > 0 ? franjas.reduce((s, f) => s + f.promedio, 0) / franjas.length : 0;

  return {
    local: {
      placeId: local.placeId,
      placeName: local.placeName,
      nivel: local.nivel,
    },
    // El contador de "ahora" es el dato más delicado del panel: en un local
    // vacío con una sola persona usando la app, un número exacto más una
    // mirada alrededor de la sala la identifica. Por debajo del umbral se
    // devuelve null y la pantalla dice "menos de N", nunca el número real.
    activosAhora: activosAhora >= MINIMO_PARA_MOSTRAR ? activosAhora : null,
    totalPeriodo,
    dias,
    rangosDisponibles: RANGOS_DIAS,
    // Movimiento día a día dentro del rango elegido, para ver la tendencia.
    porDia: [...porDia.entries()]
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => (a.dia < b.dia ? -1 : 1)),
    // El desglose por edad solo tiene sentido con volumen suficiente. Con poca
    // gente, decir "3 personas de 45+" en un bar chico apunta a alguien.
    porRango: totalPeriodo >= MINIMO_PARA_MOSTRAR ? rangosPublicables : null,
    ocultosPorRango,
    // Los escaneos NO llevan umbral de anonimato: es un contador de un cartel,
    // no de personas identificables. Saber que el QR se escaneó tres veces no
    // señala a nadie.
    escaneos: totalEscaneos,
    codigoQR: local.codigo || null,
    mejorFranja:
      mejor && mejor.promedio >= MINIMO_PARA_MOSTRAR
        ? {
          diaSemana: mejor.diaSemana,
          hora: mejor.hora,
          promedio: Math.round(mejor.promedio),
          vecesMas: promedioGeneral > 0 ? Number((mejor.promedio / promedioGeneral).toFixed(1)) : null,
        }
        : null,
    // Solo las franjas con suficiente gente. Las demás se devuelven en cero, no
    // con su número real: el filtro tiene que estar acá y no en la pantalla.
    franjas: franjas
      .filter((f) => f.promedio >= MINIMO_PARA_MOSTRAR)
      .slice(0, 24)
      .map((f) => ({ diaSemana: f.diaSemana, hora: f.hora, promedio: Math.round(f.promedio) })),
    minimoParaMostrar: MINIMO_PARA_MOSTRAR,
  };
});

// ---------------------------------------------------------------------------
// Correos de autenticación, enviados desde aquimatch.cl
//
// Firebase mandaba estos correos desde noreply@mi-app-conexion.firebaseapp.com,
// un dominio compartido por decenas de miles de apps. Comprobado el 2026-09-03:
// caían en spam TANTO en Gmail como en Hotmail, y Gmail además DESACTIVA los
// enlaces de los mensajes marcados como spam — así que ni encontrándolo se
// podía completar el registro. Con la app ya publicada, eso dejaba afuera a
// todo el que se registrara con correo y contraseña.
//
// Ahora el enlace lo genera el Admin SDK (mismo flujo de siempre) pero el
// correo lo envía Resend desde noreply@aquimatch.cl, dominio propio con SPF,
// DKIM y DMARC verificados.
// ---------------------------------------------------------------------------
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const REMITENTE = "AquíMatch <noreply@aquimatch.cl>";

// Tope de correos por dirección y por hora. Sin esto, la función de
// restablecer contraseña —que por fuerza es pública, porque quien olvidó su
// clave no tiene sesión— se podría usar para bombardear el buzón de alguien.
const MAX_CORREOS_POR_VENTANA = 3;
// Tope por origen (IP) y por hora, para que nadie use nuestro dominio de
// remitente como máquina de spam pidiendo el restablecimiento de miles de
// direcciones distintas. Más alto que el anterior a propósito: en un wifi de
// bar o detrás del NAT de una operadora móvil, varias personas comparten IP, y
// un tope estrecho dejaría afuera a gente legítima.
const MAX_CORREOS_POR_ORIGEN = 15;

function plantilla({ titulo, texto, textoBoton, enlace, cierre }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:#16121f;margin-bottom:28px">AquíMatch</div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 28px">
      <h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#16121f">${titulo}</h1>
      <p style="margin:0 0 26px;font-size:15.5px;line-height:1.6;color:#4a4458">${texto}</p>
      <a href="${enlace}" style="display:inline-block;background:#FF3D9A;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${textoBoton}</a>
      <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#7a7091">Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
        <span style="color:#4a4458;word-break:break-all">${enlace}</span></p>
    </div>
    <p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#7a7091">${cierre}</p>
    <p style="margin:14px 0 0;font-size:12.5px;color:#9a92ad">AquíMatch · Santiago, Chile · contacto@aquimatch.cl</p>
  </div>
</body></html>`;
}

async function enviarCorreo(para, asunto, html) {
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: REMITENTE, to: [para], subject: asunto, html }),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
  }
}

/**
 * Correo de verificación, al registrarse o al pedir que lo reenvíen.
 * Requiere sesión: solo se le puede mandar a la propia dirección.
 */
exports.enviarVerificacionCorreo = onCall(
  { secrets: [RESEND_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const correo = request.auth.token.email;
    if (!correo) {
      throw new HttpsError("failed-precondition", "Tu cuenta no tiene correo.");
    }
    await contarUso(
      admin.firestore().doc(`limites/${request.auth.uid}`),
      "correosVerificacion",
      "ventanaCorreosEn",
      MAX_CORREOS_POR_VENTANA,
      "Ya te enviamos varios correos. Espera un rato antes de pedir otro."
    );

    const enlace = await admin.auth().generateEmailVerificationLink(correo);
    await enviarCorreo(
      correo,
      "Confirma tu correo en AquíMatch",
      plantilla({
        titulo: "Confirma tu correo",
        texto:
          "Toca el botón para confirmar que esta dirección es tuya. Después vas a poder volver a la aplicación y seguir.",
        textoBoton: "Confirmar mi correo",
        enlace,
        cierre: "Si no creaste una cuenta en AquíMatch, puedes ignorar este mensaje.",
      })
    );
    return { ok: true };
  }
);

/**
 * Correo para restablecer la contraseña.
 *
 * NO puede exigir sesión: quien olvidó su clave justamente no puede entrar.
 * Por eso lleva dos protecciones:
 *  - un tope por dirección y por hora, con el correo guardado como hash para
 *    no dejar un listado de direcciones en la base;
 *  - y responde lo mismo exista o no la cuenta. Si contestara distinto, se
 *    podría usar para averiguar quién está registrado en AquíMatch, que en una
 *    app de este tipo es información sensible.
 */
exports.enviarRestablecerContrasena = onCall(
  { secrets: [RESEND_API_KEY], timeoutSeconds: 30 },
  async (request) => {
    const correo = String(request.data?.correo || "").trim().toLowerCase();
    if (!correo || !correo.includes("@")) {
      throw new HttpsError("invalid-argument", "Falta el correo.");
    }

    // Dos topes distintos, porque protegen de dos ataques distintos.
    //
    // El de abajo, por destinatario, evita que a UNA persona le llenen el
    // buzón. Pero no impide lo otro: pedir el restablecimiento de mil
    // direcciones distintas, una vez cada una. Cada correo pasaría el filtro
    // —van todos a destinatarios distintos— y el daño no lo sufriría ninguna
    // de esas personas, sino nosotros: se agota la cuota de Resend y, mucho
    // peor, aquimatch.cl empieza a figurar como origen de spam. Recuperar la
    // reputación de un dominio quemado toma meses, y mientras tanto ni los
    // correos de verificación llegan.
    //
    // Por eso primero se cuenta por origen. Es una función sin sesión —quien
    // olvidó su clave no puede iniciarla—, así que lo único que identifica a
    // quien llama es su IP.
    const origen = request.rawRequest?.ip || "desconocido";
    await contarUso(
      admin.firestore().doc(`limitesCorreo/origen-${crypto.createHash("sha256").update(origen).digest("hex")}`),
      "restablecer",
      "ventanaEn",
      MAX_CORREOS_POR_ORIGEN,
      "Estás pidiendo demasiados correos. Espera un rato antes de volver a intentar."
    );

    const hash = crypto.createHash("sha256").update(correo).digest("hex");
    await contarUso(
      admin.firestore().doc(`limitesCorreo/${hash}`),
      "restablecer",
      "ventanaEn",
      MAX_CORREOS_POR_VENTANA,
      "Ya enviamos varios correos a esa dirección. Espera un rato."
    );

    try {
      const enlace = await admin.auth().generatePasswordResetLink(correo);
      await enviarCorreo(
        correo,
        "Restablece tu contraseña de AquíMatch",
        plantilla({
          titulo: "Restablece tu contraseña",
          texto:
            "Toca el botón para elegir una contraseña nueva. El enlace sirve una sola vez.",
          textoBoton: "Crear una contraseña nueva",
          enlace,
          cierre:
            "Si no pediste cambiar tu contraseña, puedes ignorar este mensaje: tu cuenta sigue como está.",
        })
      );
    } catch (error) {
      // Cuenta inexistente: se responde igual que si existiera, a propósito.
      if (error?.code === "auth/user-not-found") {
        console.log("[enviarRestablecerContrasena] dirección sin cuenta");
        return { ok: true };
      }
      console.error("[enviarRestablecerContrasena]", error);
      throw new HttpsError("internal", "No pudimos enviar el correo. Intenta de nuevo.");
    }
    return { ok: true };
  }
);

// ---------------------------------------------------------------------------
// El QR de los locales: aquimatch.cl/ir/<codigo>
//
// Un dueño pone este código QR en sus mesas. Quien lo escanea llega acá, y de
// acá sale hacia donde le sirva según su teléfono. De paso se cuenta el
// escaneo, para que el dueño pueda ver en su panel cuánta gente lo usó — que
// es lo que convierte un cartel en algo medible, y lo que le permite a él
// saber si le sirvió tenernos.
//
// Es la ÚNICA función de todo el proyecto que responde a una dirección web
// abierta, sin sesión. Tiene que ser así: quien escanea todavía no tiene la
// app ni cuenta. Por eso no toca ningún dato de personas — solo lee la ficha
// del local y suma uno a un contador.
//
// Sobre inflar el contador: alguien podría recargar la dirección mil veces y
// subir el número de un local. Se asume a propósito. Lo único que consigue es
// engañar al dueño de ese local sobre su propio cartel, y el costo por visita
// es despreciable. Poner defensas de verdad (por IP, con sus lecturas
// asociadas) costaría más que el problema que evita.
// ---------------------------------------------------------------------------

const ENLACE_PLAY = "https://play.google.com/store/apps/details?id=com.aquimatch.app";

/**
 * Página para quien escanea desde un iPhone. No puede instalar nada todavía,
 * así que lo importante es que no se vaya con la sensación de que no funcionó:
 * se le explica en una línea qué es y cuándo va a poder.
 */
function paginaParaIphone(nombreLocal) {
  const donde = nombreLocal ? ` en ${nombreLocal}` : "";
  return `<!DOCTYPE html>
<html lang="es-CL"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AquíMatch</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;
  background:#0A0910;color:#F4F1FA;text-align:center;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.6}
.caja{max-width:22rem}
h1{font-size:27px;font-weight:800;letter-spacing:-.03em;line-height:1.15;margin:0 0 14px}
p{color:#A79BC0;font-size:16.5px;margin:0 0 14px}
.eti{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#7A7091;margin-bottom:18px}
a{display:inline-block;margin-top:14px;color:#FF3D9A;font-weight:600;text-decoration:none}
</style></head>
<body><div class="caja">
<p class="eti">AquíMatch</p>
<h1>Todavía no está para iPhone</h1>
<p>AquíMatch te muestra quién más está${donde} en este momento. Por ahora funciona en Android; la versión para iPhone está en camino.</p>
<p>Si tienes un Android a mano, escanea el código con ese teléfono.</p>
<a href="https://aquimatch.cl">Ver de qué se trata</a>
</div></body></html>`;
}

exports.ir = onRequest({ region: "us-central1" }, async (peticion, respuesta) => {
  // El código va en la ruta: /ir/galpon. Se limpia a conciencia porque esto
  // viene de una dirección pública y va a parar a una consulta.
  const codigo = String(peticion.path || "")
    .replace(/^\/+ir\/?/, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .slice(0, 40);

  let local = null;
  if (/^[a-z0-9-]{2,40}$/.test(codigo)) {
    try {
      const encontrados = await admin
        .firestore()
        .collection("locales")
        .where("codigo", "==", codigo)
        .limit(1)
        .get();
      if (!encontrados.empty) {
        local = { placeId: encontrados.docs[0].id, ...encontrados.docs[0].data() };
      }
    } catch (error) {
      // Que falle la consulta no puede dejar a la persona mirando un error:
      // abajo se la manda igual a descargar la app.
      console.error("[ir] no se pudo leer el local", error);
    }
  }

  // El escaneo se cuenta aparte de estadisticasLugar A PROPÓSITO. Ahí viven
  // las activaciones —gente que de verdad estuvo dentro del local—, y mezclar
  // escaneos de un cartel con presencia real corrompería el único dato que le
  // vendemos al dueño.
  if (local) {
    const dia = fechaISOChile(new Date());
    admin
      .firestore()
      .doc(`escaneosLugar/${local.placeId}_${dia}`)
      .set(
        {
          placeId: local.placeId,
          dia,
          total: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      )
      .catch((error) => console.error("[ir] no se pudo contar el escaneo", error));
  }

  const agente = String(peticion.get("user-agent") || "");
  const esIphone = /iPhone|iPad|iPod/i.test(agente);
  const esAndroid = /Android/i.test(agente);

  respuesta.set("Cache-Control", "no-store");

  if (esIphone) {
    respuesta.status(200).send(paginaParaIphone(local?.placeName));
    return;
  }

  // Android y cualquier otra cosa van a Play. El "referrer" viaja hasta Play
  // Console: así se puede ver cuántas instalaciones trajo cada local, y no
  // solo cuántos escaneos hubo.
  const marca = local
    ? `utm_source%3Dlocal%26utm_medium%3Dqr%26utm_content%3D${encodeURIComponent(local.placeId)}`
    : "utm_source%3Dlocal%26utm_medium%3Dqr";
  respuesta.redirect(302, `${ENLACE_PLAY}&referrer=${marca}`);
});

// ---------------------------------------------------------------------------
// Resumen general, solo para el administrador
//
// Play Console dice cuánta gente descargó. Cloudflare dice cuánta visitó la
// web. Ninguno de los dos contesta la única pregunta que decide si AquíMatch
// funciona: ¿alguna vez dos personas estuvieron en el mismo local a la vez?
//
// Sin eso, la app es una lista de contactos que nadie usa. Por eso el número
// que va primero acá no son las descargas: son las COINCIDENCIAS.
//
// Se cuenta con agregaciones (count()) donde se puede, que se cobran por
// índice leído y no por documento: contar 50.000 usuarios cuesta una fracción
// de lo que costaría traerlos.
// ---------------------------------------------------------------------------

exports.resumenGeneral = onCall(async (request) => {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
    throw new HttpsError("permission-denied", "Solo para el administrador.");
  }

  const db = admin.firestore();
  // dias - 1 porque la comparacion es >= y el dia de hoy tambien cuenta: pedir
  // hace(30) tomaria 31 fechas distintas, y el rotulo diria 30.
  const hace = (dias) => fechaISOChile(new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000));

  const cuantos = async (consulta) => {
    try {
      return (await consulta.count().get()).data().count;
    } catch (error) {
      console.error("[resumenGeneral] falló un conteo", error);
      return null;
    }
  };

  const [
    usuarios, completos, verificados, conexiones, mensajes, locales, interesadosGold,
    reportesTotales, reportesRevisados,
  ] = await Promise.all([
    cuantos(db.collection("usuarios")),
    cuantos(db.collection("usuarios").where("perfilCompleto", "==", true)),
    cuantos(db.collection("usuarios").where("estadoVerificacion", "==", "aprobado")),
    cuantos(db.collection("conexiones")),
    cuantos(db.collectionGroup("mensajes")),
    cuantos(db.collection("locales")),
    cuantos(db.collection("interesGold")),
    // Las denuncias pendientes NO se cuentan con where("revisado","==",false).
    //
    // reportarUsuario() no escribe ese campo: una denuncia nueva no tiene
    // `revisado` en absoluto, y solo aparece cuando el panel la marca como
    // revisada. O sea que filtrar por false devolvía CERO siempre — un número
    // diciendo "no hay nada que hacer" mientras abajo, en la misma pantalla, la
    // lista mostraba denuncias esperando. De todos los errores posibles en un
    // resumen, ese es el peor: no muestra basura, muestra calma falsa.
    //
    // Se cuentan todas y se restan las revisadas. Así entran igual las
    // antiguas, sin campo, y las nuevas.
    cuantos(db.collection("reportes")),
    cuantos(db.collection("reportes").where("revisado", "==", true)),
  ]);

  // Los buckets de los últimos 30 días. Acá sí se leen documentos, porque hay
  // que mirar el contenido de cada uno: son pocos (un local activo genera
  // como mucho un puñado por noche).
  const buckets = await db
    .collection("estadisticasLugar")
    .where("dia", ">=", hace(30))
    .get();

  let activaciones30 = 0;
  let activaciones7 = 0;
  const desde7 = hace(7);
  const localesConGente = new Set();
  // LA CIFRA QUE IMPORTA. Un bucket con 2 o más significa que esa hora, en ese
  // local, hubo al menos dos personas activadas. No prueba que se hayan visto
  // —pudieron entrar a las 21:05 y a las 21:55— pero es lo más cerca que
  // podemos estar sin guardar quién estuvo con quién, que es justamente lo que
  // prometimos no hacer.
  let horasConCoincidencia = 0;
  const localesConCoincidencia = new Set();

  buckets.docs.forEach((documento) => {
    const b = documento.data();
    const total = b.total || 0;
    activaciones30 += total;
    if (b.dia >= desde7) activaciones7 += total;
    if (total > 0) localesConGente.add(b.placeId);
    if (total >= 2) {
      horasConCoincidencia += 1;
      localesConCoincidencia.add(b.placeId);
    }
  });

  const escaneos = await db.collection("escaneosLugar").where("dia", ">=", hace(30)).get();
  const escaneosQR = escaneos.docs.reduce((suma, d) => suma + (d.data().total || 0), 0);

  return {
    generadoEnMs: Date.now(),
    gente: { usuarios, completos, verificados },
    actividad: {
      activaciones7,
      activaciones30,
      localesConGente: localesConGente.size,
      horasConCoincidencia,
      localesConCoincidencia: localesConCoincidencia.size,
    },
    encuentros: { conexiones, mensajes },
    negocio: { locales, escaneosQR, interesadosGold },
    moderacion: {
      // Si cualquiera de los dos conteos falló (devuelve null), no se inventa
      // un cero: se devuelve null y la pantalla muestra un guion.
      reportesSinRevisar:
        reportesTotales === null || reportesRevisados === null
          ? null
          : reportesTotales - reportesRevisados,
    },
  };
});
