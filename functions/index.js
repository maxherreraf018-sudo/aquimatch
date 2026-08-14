const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
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
    if (!fotoPrincipal || !selfieVerificacion) return;

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

// Tiene que coincidir con RADIO_BUSQUEDA_METROS de src/services/places.js.
const RADIO_ACTIVACION_METROS = 120;
// Freno de uso por persona (ver el comentario dentro de la función).
const VENTANA_LIMITE_MS = 60 * 60 * 1000;
const MAX_ACTIVACIONES_POR_VENTANA = 10;
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

    // 1. Preguntarle a Google qué hay realmente alrededor de esas coordenadas.
    let lugares = [];
    try {
      const respuesta = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY.value(),
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.location,places.types",
          },
          body: JSON.stringify({
            includedTypes: ["bar", "night_club", "restaurant", "cafe", "pub"],
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
      lugares = (await respuesta.json()).places || [];
    } catch (error) {
      console.error("[activarEnLugar] error consultando Places:", error);
      throw new HttpsError("unavailable", "No pudimos verificar tu ubicación. Intenta de nuevo.");
    }

    // 2. El lugar elegido tiene que estar entre los que Google ve desde ahí...
    const lugar = lugares.find((p) => p.id === placeId);
    if (!lugar) {
      throw new HttpsError(
        "permission-denied",
        "No pudimos confirmar que estés en ese lugar. Acércate a la entrada e intenta de nuevo."
      );
    }

    // 3. ...y a menos de 120 metros de verdad.
    const distancia = distanciaMetros(
      lat,
      lng,
      lugar.location?.latitude,
      lugar.location?.longitude
    );
    if (!(distancia <= RADIO_ACTIVACION_METROS)) {
      throw new HttpsError(
        "permission-denied",
        "Estás demasiado lejos de ese lugar para activarte."
      );
    }

    // 4. Los datos propios se leen del perfil guardado, nunca de lo que mande
    //    el cliente: si no, cualquiera podría activarse con el nombre y la
    //    foto de otra persona.
    const perfilSnap = await admin.firestore().doc(`usuarios/${uid}`).get();
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
      placeName: lugar.displayName?.text || "",
      lat: lugar.location?.latitude,
      lng: lugar.location?.longitude,
      tipos: lugar.types || [],
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

    return {
      placeId,
      placeName: lugar.displayName?.text || "",
      lat: lugar.location?.latitude,
      lng: lugar.location?.longitude,
      tipos: lugar.types || [],
    };
  }
);
