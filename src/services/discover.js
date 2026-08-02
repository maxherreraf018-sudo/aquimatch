import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { registrarEvento } from '../firebase/analytics'

// El ID del interés combina ambos uid + el lugar, para evitar duplicados
function idInteres(desde, hacia, placeId) {
  return `${placeId}_${desde}_${hacia}`
}

/**
 * Registra que "desde" mostró interés en "hacia" dentro de un lugar.
 * Si "hacia" ya había mostrado interés en "desde" antes (en el mismo lugar),
 * se considera interés mutuo y se crea la conexión (chat).
 *
 * Los documentos de "intereses" no se borran nunca (ni siquiera al deshacer
 * un match — allow delete: false, a propósito, para no perder evidencia).
 * Por eso, un "me interesa" viejo de ANTES de deshacer un match anterior
 * entre las mismas dos personas no debe contar como si fuera de ahora —
 * si no, alcanzaría con que una sola vuelva a tocar "Me interesa" para
 * reactivar el match solo, sin que la otra haya hecho nada esta vez. Por
 * eso se compara la fecha del interés contra la fecha del último
 * "deshacer match" entre ellos (si hay uno).
 *
 * Devuelve { mutuo: boolean, conexionId?: string }
 */
export async function marcarMeInteresa(desde, hacia, placeId) {
  const refPropio = doc(db, 'intereses', idInteres(desde, hacia, placeId))
  await setDoc(refPropio, {
    desde,
    hacia,
    placeId,
    creadoEn: serverTimestamp(),
  })
  // ¿La otra persona ya me había marcado interés a mí, en este mismo lugar?
  const refInverso = doc(db, 'intereses', idInteres(hacia, desde, placeId))
  const snapInverso = await getDoc(refInverso)
  if (snapInverso.exists()) {
    const idOrdenado = [desde, hacia].sort().join('_')
    const snapConexion = await getDoc(doc(db, 'conexiones', idOrdenado))
    const deshechoEn = snapConexion.exists() ? snapConexion.data().deshechoEn : null
    const deshechoEnMs = deshechoEn?.toMillis ? deshechoEn.toMillis() : 0
    const interesInversoEn = snapInverso.data().creadoEn
    const interesInversoEnMs = interesInversoEn?.toMillis ? interesInversoEn.toMillis() : 0
    if (interesInversoEnMs > deshechoEnMs) {
      const conexionId = await crearConexion(desde, hacia, placeId)
      registrarEvento('match_creado', { place_id: placeId })
      return { mutuo: true, conexionId }
    }
  }
  return { mutuo: false }
}

/**
 * Registra que "desde" tocó "Más tarde" con "hacia" dentro de un lugar.
 * A diferencia de marcarMeInteresa, esto nunca genera una conexión — solo
 * sirve para recordar, en futuras visitas al mismo lugar, que esta persona
 * ya fue vista y pospuesta (para mostrarla más atrás en el orden, no para
 * ocultarla).
 */
export async function marcarMasTarde(desde, hacia, placeId) {
  const ref = doc(db, 'pases', idInteres(desde, hacia, placeId))
  await setDoc(ref, {
    desde,
    hacia,
    placeId,
    creadoEn: serverTimestamp(),
  })
}

/**
 * Crea la conexión (chat) entre dos personas. El ID se arma SOLO con los
 * dos uid (ordenados), sin el lugar — un match es una relación entre dos
 * personas, no algo que se reinicia si vuelven a coincidir en otro local.
 * Si ya existe una conexión entre ellos (de un encuentro anterior, en
 * cualquier lugar), no se vuelve a crear ni se pisa su historial — se
 * reutiliza la misma, para no duplicar chats con la misma persona.
 * Las conversaciones ya NO expiran — quedan guardadas de forma permanente,
 * salvo que alguna de las dos personas deshaga el match (deshacerMatch, en
 * services/chat.js). Si la conexión ya existía pero estaba deshecha (se
 * habían encontrado antes, deshicieron el match, y ahora se reencuentran),
 * se reactiva la misma en vez de crear una nueva.
 */
async function crearConexion(uidA, uidB, placeId) {
  const idOrdenado = [uidA, uidB].sort().join('_')
  const ref = doc(db, 'conexiones', idOrdenado)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      usuarios: [uidA, uidB],
      placeId,
      creadaEn: serverTimestamp(),
      deshecho: false,
    })
  } else if (snap.data()?.deshecho) {
    await setDoc(ref, { placeId, deshecho: false }, { merge: true })
  }
  return idOrdenado
}

/**
 * Obtiene los datos básicos de un usuario (para mostrar en la pantalla de conexión).
 */
export async function obtenerPerfilBasico(uid) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

/**
 * Obtiene los datos de una conexión (para la pantalla de "Interés mutuo" / chat).
 */
export async function obtenerConexion(conexionId) {
  const ref = doc(db, 'conexiones', conexionId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Devuelve el conjunto de uids con quienes el usuario ya tiene una conexión
 * (match) VIGENTE, sin importar en qué lugar haya sido — para nunca
 * volver a mostrarlos en Descubrir, ni siquiera si se encuentran en un
 * local distinto al de la primera vez. Las conexiones deshechas
 * (deshacerMatch) no cuentan acá — esas personas pueden volver a
 * aparecer y hacer match de nuevo si se reencuentran.
 */
export async function obtenerUidsYaConectados(uid) {
  const ref = collection(db, 'conexiones')
  const q = query(ref, where('usuarios', 'array-contains', uid))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .filter((d) => !d.data().deshecho)
    .map((d) => d.data().usuarios.find((u) => u !== uid))
    .filter(Boolean)
}

/**
 * Devuelve el conjunto de uids a quienes el usuario YA le marcó "Me interesa"
 * en este lugar (sin llegar a match). Se usan para mostrarlos al final del
 * orden en Descubrir, no para ocultarlos.
 */
export async function obtenerUidsConMiInteres(uid, placeId) {
  const ref = collection(db, 'intereses')
  const q = query(ref, where('desde', '==', uid), where('placeId', '==', placeId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => d.data().hacia).filter(Boolean)
}

/**
 * Devuelve el conjunto de uids a quienes el usuario YA le tocó "Más tarde"
 * en este lugar. Se usan para mostrarlos en el medio del orden en
 * Descubrir (después de las personas nuevas, antes de las que ya le dio
 * like), no para ocultarlos.
 */
export async function obtenerUidsConMiPase(uid, placeId) {
  const ref = collection(db, 'pases')
  const q = query(ref, where('desde', '==', uid), where('placeId', '==', placeId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => d.data().hacia).filter(Boolean)
}

/**
 * Calcula la edad a partir de una fecha de nacimiento (YYYY-MM-DD).
 */
export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const nacimiento = new Date(fechaNacimiento)
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const m = hoy.getMonth() - nacimiento.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--
  return edad
}
