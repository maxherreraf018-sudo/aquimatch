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
    const seSubioSelfieNueva =
      !!despues?.selfieVerificacion && despues.selfieVerificacion !== antes?.selfieVerificacion;
    if (!ahoraEstaPendiente || !seSubioSelfieNueva) return;

    const fotoPrincipal = despues.fotoPrincipal;
    const selfieVerificacion = despues.selfieVerificacion;
    if (!fotoPrincipal || !selfieVerificacion) return;

    const uid = event.params.uid;
    const ref = admin.firestore().doc(`usuarios/${uid}`);

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
  await db.doc(`usuarios/${uid}`).delete();
  await admin.auth().deleteUser(uid);

  return { ok: true };
});
