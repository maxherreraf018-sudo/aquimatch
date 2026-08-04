import { collection, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

// Ventana de "en línea": si tuvo la app abierta (en cualquier pantalla,
// gracias al latido de useLatidoConexion) dentro de este tiempo, se
// considera conectada ahora. Deliberadamente corta y separada del umbral
// de Descubrir (3 horas) — acá representa "tiene la app abierta", no
// "sigue presente en el lugar", que es una pregunta distinta.
const UMBRAL_EN_LINEA_MS = 10 * 60 * 1000

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
 * ¿Esa persona tuvo la app abierta hace poco (en cualquier pantalla, no
 * solo en un lugar)? Se usa para el punto verde de "en línea" en la lista
 * de chats y dentro del chat. Se basa en usuarios/{uid}.ultimaConexion,
 * que renueva useLatidoConexion cada par de minutos mientras hay sesión —
 * independiente de si esa persona está activa en algún lugar o no.
 */
export async function estaActivaAhora(uid) {
  try {
    const ref = doc(db, 'usuarios', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return false
    const ultimaConexion = snap.data()?.ultimaConexion
    if (!ultimaConexion) return false
    const ms = ultimaConexion.toMillis ? ultimaConexion.toMillis() : ultimaConexion
    return Date.now() - ms < UMBRAL_EN_LINEA_MS
  } catch (err) {
    return false
  }
}
