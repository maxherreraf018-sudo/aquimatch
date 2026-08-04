import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { registrarEvento } from '../firebase/analytics'

// Radio máximo antes de considerar que el usuario ya se fue del lugar.
// Los lugares grandes (universidades, estadios) necesitan un radio mayor
// que un bar chico, para no marcar como "se fue" a alguien que solo
// caminó de un edificio a otro dentro del mismo campus/recinto.
export const RADIO_SALIDA_METROS = 200
export const RADIO_SALIDA_LUGAR_GRANDE_METROS = 800
export const RADIO_SALIDA_ESTADIO_METROS = 500

export function radioSalidaSegunTipos(tipos = []) {
  if (tipos.includes('university')) return RADIO_SALIDA_LUGAR_GRANDE_METROS
  if (tipos.includes('stadium')) return RADIO_SALIDA_ESTADIO_METROS
  return RADIO_SALIDA_METROS
}
// Duración de la pausa "No por ahora" (DEC-006): 20 minutos, una vez por sesión de participación.
export const DURACION_PAUSA_MS = 20 * 60 * 1000

// Si una activación no se "renueva" en este tiempo, se trata como si esa
// persona ya no estuviera presente, aunque su campo activa siga en true
// (por ejemplo, si cerró la app sin tocar "Salir de este lugar" y el GPS
// nunca detectó que se alejó). Esto evita "personas fantasma" contándose
// como presentes días después de haberse ido. 3 horas para cubrir una
// noche entera sin exigir que la persona tenga la app abierta todo el
// tiempo (antes eran 20 min, muy poco para alguien que guarda el celular
// mientras está en el lugar).
export const UMBRAL_INACTIVIDAD_MS = 3 * 60 * 60 * 1000

// Cada cuánto se debe "avisar" que uno sigue aquí, mientras está en las
// pantallas de Estado o Descubrir. Tiene que ser bastante menor al umbral
// de inactividad de arriba, para que nunca se pase de la raya por error.
export const INTERVALO_LATIDO_MS = 5 * 60 * 1000

/**
 * Activa la participación del usuario en un lugar.
 * Usamos el uid como ID del documento: una activación activa por usuario.
 * modo empieza en null; se define justo después, en la pantalla de
 * "¿Cómo quieres entrar?" (Participar / Explorar).
 */
export async function activarEnLugar(uid, datosUsuario, lugar) {
  const ref = doc(db, 'activaciones', uid)
  await setDoc(ref, {
    uid,
    nombre: datosUsuario.nombre || '',
    fotoPrincipal: datosUsuario.fotoPrincipal || '',
    genero: datosUsuario.genero || '',
    preferenciaGenero: datosUsuario.preferenciaGenero || 'ambos',
    placeId: lugar.placeId,
    placeName: lugar.nombre,
    lat: lugar.lat,
    lng: lugar.lng,
    tipos: lugar.tipos || [],
    activa: true,
    modo: null,
    pausadoHasta: null,
    pausaUsada: false,
    iniciadaEn: serverTimestamp(),
    actualizadaEn: serverTimestamp(),
  })
  registrarEvento('activacion_iniciada', { place_id: lugar.placeId, place_name: lugar.nombre })
}

/**
 * Desactiva la participación (salida manual o automática por GPS).
 */
export async function desactivarParticipacion(uid) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    activa: false,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * "Late" que la persona sigue presente, renovando actualizadaEn sin
 * cambiar nada más. Se llama periódicamente mientras el usuario está en
 * las pantallas de Estado o Descubrir, para que nunca se le trate como
 * "persona fantasma" por error mientras sigue realmente ahí.
 */
export async function renovarActividad(uid) {
  const ref = doc(db, 'activaciones', uid)
  try {
    await updateDoc(ref, { actualizadaEn: serverTimestamp() })
  } catch (err) {
    // Si falla (por ejemplo, la activación ya no existe), no hacemos nada
    // más — no vale la pena interrumpir al usuario por esto.
  }
}

/**
 * Guarda el modo elegido: 'participar' (visible, puede conectar) o
 * 'explorar' (invisible para los demás, solo puede mirar). Se elige una
 * vez por visita, justo después de confirmar el lugar.
 */
export async function actualizarModo(uid, modo) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    modo,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Actualiza la preferencia de género en la activación en curso, cuando la
 * persona la cambia desde Perfil mientras ya está activa en un lugar — si
 * no se actualizara acá también, el cambio no tendría efecto hasta la
 * próxima vez que se active (el filtro de compatibilidad en Descubrir lee
 * este campo desde la activación, no desde el perfil).
 */
export async function actualizarPreferenciaGeneroActivacion(uid, preferenciaGenero) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    preferenciaGenero,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Guarda o actualiza el "Plan de la noche" del usuario mientras participa.
 */
export async function actualizarPlan(uid, plan) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    plan,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Activa la pausa "No por ahora" (DEC-006): dura 20 minutos y solo puede
 * usarse una vez por sesión de participación.
 */
export async function pausarParticipacion(uid) {
  const ref = doc(db, 'activaciones', uid)
  const pausadoHasta = Timestamp.fromMillis(Date.now() + DURACION_PAUSA_MS)
  await updateDoc(ref, {
    pausadoHasta,
    pausaUsada: true,
    actualizadaEn: serverTimestamp(),
  })
  return pausadoHasta
}

/**
 * Termina la pausa antes de que se cumplan los 20 minutos. No devuelve el
 * "una vez por visita" — pausaUsada se queda en true, para que no sirva
 * como forma de pausar y despausar repetidas veces.
 */
export async function cancelarPausa(uid) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    pausadoHasta: null,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Obtiene la activación actual del usuario (para saber en qué lugar está).
 */
export async function obtenerActivacionPropia(uid) {
  const { getDoc } = await import('firebase/firestore')
  const ref = doc(db, 'activaciones', uid)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

// ¿Esta activación se "renovó" hace poco, o ya se puede considerar
// abandonada/fantasma aunque diga activa: true?
export function esRecienteYActiva(persona, ahoraMs) {
  if (!persona.activa) return false
  const referencia = persona.actualizadaEn || persona.iniciadaEn
  if (!referencia) return false
  const refMs = referencia.toMillis ? referencia.toMillis() : referencia
  return ahoraMs - refMs <= UMBRAL_INACTIVIDAD_MS
}

/**
 * Escucha en tiempo real cuántas personas activas hay en el mismo lugar.
 * callback recibe la lista de activaciones activas Y con actividad
 * reciente (sin contar al propio usuario) — las que quedaron "pegadas"
 * en activa: true por días sin renovarse se excluyen automáticamente.
 * Incluye a quienes están en modo 'explorar'; quién debe verse o no se
 * filtra con personasVisibles(), para no mezclar responsabilidades.
 */
export function escucharPersonasEnElLugar(placeId, uidPropio, callback) {
  const ref = collection(db, 'activaciones')
  const q = query(ref, where('placeId', '==', placeId), where('activa', '==', true))
  return onSnapshot(q, (snapshot) => {
    const ahora = Date.now()
    const personas = snapshot.docs
      .map((d) => d.data())
      .filter((persona) => persona.uid !== uidPropio)
      .filter((persona) => esRecienteYActiva(persona, ahora))
    callback(personas)
  })
}

/**
 * Filtra quiénes deben verse en el descubrimiento y en el conteo de
 * "personas participando": nunca quienes eligieron modo 'explorar'.
 */
export function personasVisibles(lista) {
  return lista.filter((p) => p.modo !== 'explorar')
}
