import { collection, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

// Ventana de "en línea ahora": un poco más ancha que el intervalo del
// latido (2 min, ver useLatidoConexion) para no marcar a alguien como
// "desconectado" justo antes de que llegue su próximo latido. Separado a
// propósito del umbral de Descubrir (3 horas) — acá representa "tiene la
// app abierta", no "sigue presente en el lugar", que es una pregunta
// distinta.
const UMBRAL_ACTIVO_AHORA_MS = 3 * 60 * 1000

// A partir de cuántos días sin conexión dejamos de mostrar el texto (se
// vuelve poco útil / medio raro decir "activo hace 19 días").
const DIAS_MAX_TEXTO = 6

function formatearHaceCuanto(ms) {
  const diffMin = Math.floor((Date.now() - ms) / 60000)
  if (diffMin < 60) return `Activo hace ${diffMin} min`
  const diffHoras = Math.floor(diffMin / 60)
  if (diffHoras < 24) return `Activo hace ${diffHoras} h`
  const diffDias = Math.floor(diffHoras / 24)
  if (diffDias === 1) return 'Activo ayer'
  if (diffDias <= DIAS_MAX_TEXTO) return `Activo hace ${diffDias} días`
  return null
}

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
 * Estado de conexión de esa persona, para el punto verde y el texto de
 * "Activo hace X" en la lista de chats y dentro del chat — basado en
 * usuarios/{uid}.ultimaConexion, que renueva useLatidoConexion cada par de
 * minutos mientras hay sesión, en cualquier pantalla (independiente de si
 * esa persona está activa en algún lugar o no).
 * Devuelve { activo, texto }:
 *  - activo=true: tiene la app abierta ahora mismo (punto verde, "Activo ahora").
 *  - activo=false, texto="Activo hace 5 min" / "Activo ayer" / etc: no está
 *    ahora mismo, pero sabemos cuándo fue la última vez (sin punto, con texto).
 *  - activo=false, texto=null: no hay dato, o es muy antiguo — no se muestra nada.
 */
export async function obtenerEstadoConexion(uid) {
  try {
    const ref = doc(db, 'usuarios', uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { activo: false, texto: null }
    const ultimaConexion = snap.data()?.ultimaConexion
    if (!ultimaConexion) return { activo: false, texto: null }
    const ms = ultimaConexion.toMillis ? ultimaConexion.toMillis() : ultimaConexion
    if (Date.now() - ms < UMBRAL_ACTIVO_AHORA_MS) return { activo: true, texto: 'Activo ahora' }
    return { activo: false, texto: formatearHaceCuanto(ms) }
  } catch (err) {
    return { activo: false, texto: null }
  }
}
