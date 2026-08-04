import { collection, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { esRecienteYActiva } from './activation'

// Última actividad real de un chat: el último mensaje si ya hay alguno,
// si no, cuándo se creó el match — mismo criterio que usa ChatsList.jsx
// para mostrar la fecha.
function ultimaActividadMs(conexion) {
  const referencia = conexion.ultimoMensajeEn || conexion.creadaEn
  return referencia?.toMillis ? referencia.toMillis() : 0
}

/**
 * Escucha en tiempo real todas las conexiones (chats) del usuario,
 * sin importar el lugar, ordenadas por conversación más reciente primero
 * (último mensaje, o creación del match si todavía no hay mensajes).
 * Excluye las que se hayan deshecho (deshacerMatch, en services/chat.js)
 * y también las que quedaron ocultas por el mecanismo viejo (ocultaPara,
 * de antes de que existiera "deshacer match") — sin este segundo chequeo,
 * una conversación que ya se había ocultado por ese camino reaparecería.
 */
export function escucharMisChats(uid, callback) {
  const ref = collection(db, 'conexiones')
  const q = query(ref, where('usuarios', 'array-contains', uid))
  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => !c.deshecho && !(c.ocultaPara || []).includes(uid))
      .sort((a, b) => ultimaActividadMs(b) - ultimaActividadMs(a))
    callback(chats)
  })
}

/**
 * ¿Este chat tiene algo nuevo que este usuario todavía no vio?
 * Compara la última actividad (último mensaje, o la creación si aún no
 * hay mensajes) contra la última vez que el usuario abrió ese chat.
 * Si el último mensaje lo mandó el propio usuario, nunca cuenta como "no
 * leído" — es obvio que ya lo vio, lo escribió él mismo.
 */
export function estaSinLeer(conexion, uid) {
  if (conexion.ultimoMensajeAutor === uid) return false
  const referencia = conexion.ultimoMensajeEn || conexion.creadaEn
  if (!referencia) return false
  const refMs = referencia.toMillis ? referencia.toMillis() : referencia
  const ultimaLectura = conexion.ultimaLectura?.[uid]
  if (!ultimaLectura) return true
  const lecturaMs = ultimaLectura.toMillis ? ultimaLectura.toMillis() : ultimaLectura
  return refMs > lecturaMs
}

/**
 * ¿Esa persona está activa en un lugar ahora mismo? Se usa para el punto
 * verde de "en línea" en la lista de chats. Además de que el campo
 * "activa" esté en true, exige que se haya renovado hace poco (mismo
 * criterio que usa Descubrir) — si alguien cerró la app de golpe sin pasar
 * por la salida normal, "activa" se puede quedar pegado en true para
 * siempre, y sin este chequeo aparecería como conectado por días.
 */
export async function estaActivaAhora(uid) {
  try {
    const ref = doc(db, 'activaciones', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    return esRecienteYActiva(snap.data(), Date.now())
  } catch (err) {
    return false
  }
}
