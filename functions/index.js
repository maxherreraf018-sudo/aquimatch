const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { RekognitionClient, CompareFacesCommand } = require("@aws-sdk/client-rekognition");

admin.initializeApp();

const AWS_ACCESS_KEY_ID = defineSecret("AWS_ACCESS_KEY_ID");
const AWS_SECRET_ACCESS_KEY = defineSecret("AWS_SECRET_ACCESS_KEY");

// Umbral de aprobación (%). Definido junto con Max: 30% o más se aprueba
// sola; menos de 30% se rechaza sola. Sin revisión manual por ahora —
// versión simple para arrancar, se puede volver más estricta más adelante.
const UMBRAL_APROBACION = 30;

// Descarga una imagen desde su URL pública de Firebase Storage y la
// devuelve como bytes, que es lo que pide Rekognition.
async function descargarImagenComoBytes(url) {
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar la imagen (${respuesta.status})`);
  }
  const arrayBuffer = await respuesta.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    // Primero la del documento público (app antigua); si no está, la de la
    // subcolección privada (app nueva).
    let selfieVerificacion = despues.selfieVerificacion;
    if (!selfieVerificacion) {
      const snapPrivado = await admin.firestore().doc(`usuarios/${uid}/privado/datos`).get();
      selfieVerificacion = snapPrivado.exists ? snapPrivado.data().selfieVerificacion : null;
    }
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
    if (!selfieVerificacion) return;

    try {
      const [fotoBytes, selfieBytes] = await Promise.all([
        descargarImagenComoBytes(fotoPrincipal),
        descargarImagenComoBytes(selfieVerificacion),
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

    const [destinatarioSnap, autorSnap] = await Promise.all([
      admin.firestore().doc(`usuarios/${destinatarioUid}`).get(),
      admin.firestore().doc(`usuarios/${mensaje.autorUid}`).get(),
    ]);
    const token = destinatarioSnap.data()?.fcmToken;
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

    await Promise.all(
      usuarios.map(async (uid, i) => {
        const token = datos[i].fcmToken;
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

function rangoEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const m = hoy.getUTCMonth() - nacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < nacimiento.getUTCDate())) edad--;
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
async function registrarEstadistica(placeId, placeName, perfil, activacionPrevia) {
  try {
    const ahora = new Date();
    const { dia, hora, diaSemana } = bucketHorario(ahora);

    if (activacionPrevia && activacionPrevia.placeId === placeId && activacionPrevia.iniciadaEn) {
      const previa = bucketHorario(activacionPrevia.iniciadaEn.toDate());
      if (previa.dia === dia && previa.hora === hora) return;
    }

    const rango = rangoEdad(perfil.fechaNacimiento);
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
// Máximo de lugares que se le ofrecen a la persona para elegir.
const MAX_LUGARES_MOSTRADOS = 2;
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
    const refLimite = admin.firestore().doc(`limites/${uid}`);
    const ahoraMs = Date.now();
    const limite = (await refLimite.get()).data() || {};
    const enVentana =
      limite.ventanaBusquedasEn && ahoraMs - limite.ventanaBusquedasEn < VENTANA_LIMITE_MS;
    const busquedas = enVentana ? limite.busquedas || 0 : 0;
    if (busquedas >= MAX_BUSQUEDAS_POR_VENTANA) {
      throw new HttpsError(
        "resource-exhausted",
        "Hiciste demasiadas búsquedas seguidas. Espera un rato."
      );
    }
    await refLimite.set(
      {
        busquedas: busquedas + 1,
        ventanaBusquedasEn: enVentana ? limite.ventanaBusquedasEn : ahoraMs,
      },
      { merge: true }
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
    const refLimite = admin.firestore().doc(`limites/${uid}`);
    const ahoraMs = Date.now();
    const limite = (await refLimite.get()).data() || {};
    const dentroDeLaVentana =
      limite.ventanaIniciadaEn && ahoraMs - limite.ventanaIniciadaEn < VENTANA_LIMITE_MS;
    const intentos = dentroDeLaVentana ? limite.intentos || 0 : 0;
    if (intentos >= MAX_ACTIVACIONES_POR_VENTANA) {
      throw new HttpsError(
        "resource-exhausted",
        "Hiciste demasiados intentos seguidos. Espera un rato antes de volver a activarte."
      );
    }
    await refLimite.set(
      {
        intentos: intentos + 1,
        ventanaIniciadaEn: dentroDeLaVentana ? limite.ventanaIniciadaEn : ahoraMs,
      },
      { merge: true }
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
    if (perfil.estadoVerificacion === "pendiente" || perfil.estadoVerificacion === "rechazado") {
      throw new HttpsError("failed-precondition", "Tu perfil todavía no está verificado.");
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
      activa: true,
      modo: null,
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
      perfil,
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

  // Cuánta gente hay ahora: el bucket de la hora en curso.
  const ahora = bucketHorario(new Date());
  let activosAhora = 0;

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
    if (b.dia === ahora.dia && b.hora === ahora.hora) activosAhora = total;

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
    porRango: totalPeriodo >= MINIMO_PARA_MOSTRAR ? porRango : null,
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
// Migración de una sola vez: selfies y datos privados que quedaron expuestos
//
// El 2026-08-14 los campos sensibles (selfie de verificación, contacto de
// confianza y correo) se movieron a `usuarios/{uid}/privado/datos`. Pero la
// migración es del lado del cliente: corre la primera vez que cada persona
// vuelve a entrar. Quien no volvió, sigue con esos campos en el documento
// PÚBLICO, que puede leer cualquiera que conozca su uid — y el uid viaja
// dentro de cada activación, así que lo tiene cualquiera que haya estado en
// el mismo bar.
//
// Y hay algo peor, que es la razón de fondo de esta función: quitar el campo
// NO alcanza. La selfie se guardaba como URL de descarga de Firebase Storage,
// y esa URL lleva su propio token: sigue funcionando para siempre, para
// cualquiera que la haya copiado, sin pasar por las reglas de Storage. Antes
// del 2026-08-13 se podía además RECORRER la colección entera de usuarios, o
// sea que cualquiera con una cuenta pudo bajarse todas esas URLs de una sola
// vez.
//
// Por eso se le rota el token a TODAS las selfies, no solo a las sin migrar:
// cualquier cuenta anterior al 13 de agosto pudo quedar expuesta aunque su
// documento ya esté limpio. Rotar el token mata las URLs viejas, y la URL
// nueva se guarda en la subcolección privada, que es de donde la lee el panel
// de moderación (ver conSelfies en src/services/admin.js).
//
// Corre sola y se marca como hecha para no repetirse. Una vez confirmada,
// esta función se puede borrar del archivo.
// ---------------------------------------------------------------------------
const CAMPOS_PRIVADOS = ["correo", "selfieVerificacion", "contactoConfianza"];

exports.migrarDatosExpuestos = onSchedule(
  { schedule: "every 10 minutes", timeZone: "America/Santiago" },
  async () => {
    const db = admin.firestore();
    const refMarca = db.doc("mantenimiento/migracionSelfies");
    if ((await refMarca.get()).exists) {
      console.log("[migrarDatosExpuestos] ya se hizo, no hay nada que hacer");
      return;
    }

    const bucket = admin.storage().bucket();
    const usuarios = await db.collection("usuarios").get();
    let camposMovidos = 0;
    let tokensRotados = 0;
    let sinSelfie = 0;

    for (const documento of usuarios.docs) {
      const uid = documento.id;
      const datos = documento.data();

      // 1. Rotar el token de la selfie y quedarse con la URL nueva.
      let urlNueva = null;
      try {
        const archivo = bucket.file(`selfies-verificacion/${uid}/selfie.jpg`);
        const [existe] = await archivo.exists();
        if (existe) {
          const token = crypto.randomUUID();
          // Escribir este campo REEMPLAZA los tokens anteriores: cualquier URL
          // que se haya filtrado deja de servir en ese mismo momento.
          await archivo.setMetadata({
            metadata: { firebaseStorageDownloadTokens: token },
          });
          urlNueva =
            `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
            `/o/${encodeURIComponent(archivo.name)}?alt=media&token=${token}`;
          tokensRotados++;
        } else {
          sinSelfie++;
        }
      } catch (error) {
        console.error(`[migrarDatosExpuestos] token de ${uid}:`, error);
      }

      // 2. Mover a la subcolección privada lo que haya quedado en el público,
      //    y guardar de paso la URL nueva de la selfie.
      const presentes = CAMPOS_PRIVADOS.filter((campo) => datos[campo] !== undefined);
      const aGuardar = {};
      const aBorrar = {};
      presentes.forEach((campo) => {
        aGuardar[campo] = datos[campo];
        aBorrar[campo] = admin.firestore.FieldValue.delete();
      });
      if (urlNueva) aGuardar.selfieVerificacion = urlNueva;

      try {
        // Copiar primero y borrar después: si algo falla en el medio, el dato
        // queda duplicado (recuperable) en vez de perdido.
        if (Object.keys(aGuardar).length > 0) {
          await db.doc(`usuarios/${uid}/privado/datos`).set(aGuardar, { merge: true });
        }
        if (presentes.length > 0) {
          await documento.ref.update(aBorrar);
          camposMovidos++;
        }
      } catch (error) {
        console.error(`[migrarDatosExpuestos] campos de ${uid}:`, error);
      }
    }

    await refMarca.set({
      hechoEn: admin.firestore.FieldValue.serverTimestamp(),
      usuariosRevisados: usuarios.size,
      camposMovidos,
      tokensRotados,
      sinSelfie,
    });
    console.log(
      `[migrarDatosExpuestos] ${usuarios.size} usuarios · ` +
        `${camposMovidos} con datos en el documento público · ` +
        `${tokensRotados} tokens rotados · ${sinSelfie} sin selfie`
    );
  }
);
