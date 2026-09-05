import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// Preguntas sugeridas para romper el hielo (opcional, nunca obligatorio)
export const PREGUNTAS_ROMPEHIELO = [
  '¿Qué trago recomiendas del local? 🍹',
  '¿Qué canción no puede faltar ahora? 🎵',
  '¿Qué pedirías para compartir? 🍟',
]

/**
 * Envía un mensaje de texto dentro de una conexión, y actualiza
 * ultimoMensajeEn en la conexión (para poder calcular "no leídos" sin
 * tener que leer toda la subcolección de mensajes cada vez). También
 * guarda el texto y el autor del último mensaje, para poder mostrar una
 * vista previa en la lista de "Mis chats".
 */
export async function enviarMensaje(conexionId, autorUid, texto) {
  const textoLimpio = texto.trim()
  if (!textoLimpio) return
  const refMensajes = collection(db, 'conexiones', conexionId, 'mensajes')
  await addDoc(refMensajes, {
    autorUid,
    texto: textoLimpio,
    creadoEn: serverTimestamp(),
  })
  const refConexion = doc(db, 'conexiones', conexionId)
  await updateDoc(refConexion, {
    ultimoMensajeEn: serverTimestamp(),
    ultimoMensajeTexto: textoLimpio,
    ultimoMensajeAutor: autorUid,
  })
}

/**
 * Marca un chat como leído por este usuario en este momento.
 * Se usa para saber si mostrar el indicador de "no leído" en la barra
 * de navegación (pestaña Chats).
 */
export async function marcarChatLeido(conexionId, uid) {
  const ref = doc(db, 'conexiones', conexionId)
  await updateDoc(ref, {
    [`ultimaLectura.${uid}`]: serverTimestamp(),
  })
}

/**
 * Escucha los mensajes de una conexión en tiempo real, ordenados por fecha.
 *
 * `ocultarAntesDe` es la fecha del último "Eliminar conversación"
 * (`deshechoEn`). Si se pasa, los mensajes anteriores a esa fecha ni
 * siquiera se piden a Firestore: si dos personas se vuelven a encontrar y
 * rehacen el match, la conversación arranca en blanco, como espera quien
 * tocó "Eliminar conversación". Los mensajes viejos siguen guardados en la
 * base por si hay que revisarlos ante una denuncia, pero ninguna de las dos
 * personas vuelve a verlos nunca.
 */
export function escucharMensajes(conexionId, callback, ocultarAntesDe = null) {
  const ref = collection(db, 'conexiones', conexionId, 'mensajes')
  const q = ocultarAntesDe
    ? query(ref, where('creadoEn', '>', ocultarAntesDe), orderBy('creadoEn', 'asc'))
    : query(ref, orderBy('creadoEn', 'asc'))
  return onSnapshot(q, (snapshot) => {
    const mensajes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(mensajes)
  })
}

/**
 * Bloquea a otro usuario. Nunca más se mostrarán entre sí (en ningún lugar).
 */
export async function bloquearUsuario(uidPropio, uidBloqueado) {
  // Va a los datos privados: la lista dice con quién tuviste un problema, y el
  // documento público lo puede leer cualquiera que conozca tu uid — incluida
  // la persona que acabas de bloquear.
  //
  // Las reglas de Firestore miran las dos ubicaciones mientras dure la
  // mudanza, así que el bloqueo se sigue haciendo cumplir en el servidor
  // aunque la otra persona tenga una versión vieja de la app.
  const ref = doc(db, 'usuarios', uidPropio, 'privado', 'datos')
  await setDoc(ref, { bloqueados: arrayUnion(uidBloqueado) }, { merge: true })
}

/**
 * Deshace un bloqueo. No existía: bloquear era un camino sin vuelta, y ni
 * siquiera había forma de saber a quién habías bloqueado. Max lo encontró
 * probando, intentando deshacer un bloqueo que había hecho para probar.
 *
 * Saca el uid de LOS DOS lugares. La lista se está mudando a los datos
 * privados, y un bloqueo hecho con una versión anterior de la app quedó
 * anotado en el documento público: si solo se limpiara el lugar nuevo, la
 * persona seguiría bloqueada y el botón parecería no hacer nada.
 */
export async function desbloquearUsuario(uidPropio, uidBloqueado) {
  await Promise.all([
    setDoc(
      doc(db, 'usuarios', uidPropio, 'privado', 'datos'),
      { bloqueados: arrayRemove(uidBloqueado) },
      { merge: true }
    ),
    updateDoc(doc(db, 'usuarios', uidPropio), {
      bloqueados: arrayRemove(uidBloqueado),
    }).catch(() => {
      // Si el campo viejo ya no existe, updateDoc falla y da igual: significa
      // que esta cuenta ya se mudó y no hay nada que limpiar ahí.
    }),
  ])
}

/**
 * Envía un reporte. El usuario reportado nunca recibe notificación de esto.
 */
export async function reportarUsuario(uidReportadoPor, uidReportado, conexionId, motivo) {
  const ref = collection(db, 'reportes')
  await addDoc(ref, {
    reportadoPor: uidReportadoPor,
    reportado: uidReportado,
    conexionId,
    motivo,
    creadoEn: serverTimestamp(),
  })
}

/**
 * Deshace el match: desaparece de la lista de chats de las DOS personas y
 * deja de contar como "ya conectados" (pueden volver a aparecerse en
 * Descubrir y hacer match de nuevo si se reencuentran). Los mensajes no
 * se borran de la base de datos — quedan por si hace falta revisarlos ante
 * una denuncia — pero ninguna de las dos personas vuelve a verlos nunca
 * más, ni siquiera si rehacen el match (ver escucharMensajes, que filtra
 * por `deshechoEn`).
 *
 * Se borra además la vista previa del último mensaje: sin esto, al rehacer
 * el match la lista de "Mis chats" seguiría mostrando el texto de una
 * conversación que para ambos ya no existe.
 */
export async function deshacerMatch(conexionId) {
  const ref = doc(db, 'conexiones', conexionId)
  await updateDoc(ref, {
    deshecho: true,
    deshechoEn: serverTimestamp(),
    ultimoMensajeTexto: deleteField(),
    ultimoMensajeAutor: deleteField(),
    ultimoMensajeEn: deleteField(),
  })
}
