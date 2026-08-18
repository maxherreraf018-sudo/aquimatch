import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// ---------------------------------------------------------------------------
// Cuentas de local (panel para dueños de bares/restoranes/discos)
//
// El id del documento es el placeId de Google. Eso no es un detalle técnico:
// resuelve solo el problema de "dos personas dicen ser dueñas del mismo bar".
// Como no pueden existir dos documentos con el mismo id, el primero verificado
// se queda con el local, y cualquier otro reclamo tiene que pasar por el panel.
//
// Hoy las cuentas las crea únicamente el panel de moderación, a mano, después
// de que Max haya visto una prueba (iniciación de actividades del SII con la
// dirección, patente municipal, o al dueño en persona). Es a propósito: con
// los primeros locales, ese paso humano no es un costo sino la conversación de
// venta. Cuando revisar a mano empiece a doler, se agregan los métodos
// automáticos sin migrar nada — por eso `metodoVerificacion` se guarda desde
// el primer día.
// ---------------------------------------------------------------------------

export const ESTADOS = {
  pendiente: 'Pendiente',
  verificado: 'Verificado',
  rechazado: 'Rechazado',
  revocado: 'Revocado',
}

// Los niveles existen porque el riesgo no es el mismo para todas las funciones
// del panel. Ver los conteos de un local ajeno es un problema comercial;
// "mandar un aviso" le empuja un mensaje a personas que están físicamente
// dentro del bar en ese momento, que es el único vector de abuso serio.
export const NIVELES = {
  ninguno: 'Sin acceso',
  basico: 'Ve estadísticas',
  reforzado: 'Estadísticas + avisos',
}

export const METODOS_VERIFICACION = {
  manual: 'Revisión manual',
  telefono: 'Código al teléfono del local',
  perfil_google: 'Perfil de Empresa de Google',
}

export function puedeVerEstadisticas(local) {
  return local?.estado === 'verificado' && (local.nivel === 'basico' || local.nivel === 'reforzado')
}

export function puedeMandarAvisos(local) {
  return local?.estado === 'verificado' && local.nivel === 'reforzado'
}

export async function obtenerLocal(placeId) {
  const snap = await getDoc(doc(db, 'locales', placeId))
  return snap.exists() ? { placeId: snap.id, ...snap.data() } : null
}

export function escucharLocales(callback) {
  const q = query(collection(db, 'locales'), orderBy('creadoEn', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ placeId: d.id, ...d.data() })))
  })
}

/**
 * Crea la cuenta de un local ya verificada a mano.
 *
 * `responsableUid` queda en null a propósito: normalmente Max crea la cuenta
 * durante la visita al local, antes de que la persona se haya registrado en la
 * app. Se guarda su correo y el uid se enlaza después, cuando entre.
 */
export async function crearCuentaLocal({
  placeId,
  placeName,
  responsableNombre,
  responsableCorreo,
  nivel = 'basico',
  nota = '',
  adminUid,
}) {
  const existente = await obtenerLocal(placeId)
  if (existente) {
    throw new Error(`Ese local ya tiene cuenta (${ESTADOS[existente.estado] || existente.estado}).`)
  }
  await setDoc(doc(db, 'locales', placeId), {
    placeId,
    placeName: placeName || '',
    responsableUid: null,
    responsableNombre: responsableNombre || '',
    responsableCorreo: (responsableCorreo || '').trim().toLowerCase(),
    estado: 'verificado',
    nivel,
    metodoVerificacion: 'manual',
    nota,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    revisadoPor: adminUid,
  })
}

export async function cambiarNivelLocal(placeId, nivel) {
  await updateDoc(doc(db, 'locales', placeId), { nivel, actualizadoEn: serverTimestamp() })
}

/**
 * Corta el acceso sin borrar el registro. Hace falta porque el administrador
 * de un bar puede dejar de trabajar ahí, o el local puede dejar de pagar —
 * y en los dos casos conviene conservar el historial de quién tuvo acceso.
 */
export async function revocarLocal(placeId) {
  await updateDoc(doc(db, 'locales', placeId), {
    estado: 'revocado',
    nivel: 'ninguno',
    actualizadoEn: serverTimestamp(),
  })
}

export async function reactivarLocal(placeId, nivel = 'basico') {
  await updateDoc(doc(db, 'locales', placeId), {
    estado: 'verificado',
    nivel,
    actualizadoEn: serverTimestamp(),
  })
}

// ---------------------------------------------------------------------------
// Actividad real por lugar
//
// Agrupa los contadores anónimos que escribe la Cloud Function (colección
// estadisticasLugar) para responder una sola pregunta: en qué locales se está
// usando de verdad AquíMatch. Esa lista ES la lista de a quién venderle el
// panel — no tiene sentido ofrecérselo a un bar donde nunca se activó nadie.
// ---------------------------------------------------------------------------

export function escucharActividadPorLugar(callback, maximoDocumentos = 500) {
  const q = query(
    collection(db, 'estadisticasLugar'),
    orderBy('actualizadoEn', 'desc'),
    limit(maximoDocumentos)
  )
  return onSnapshot(q, (snapshot) => {
    const porLugar = new Map()
    snapshot.docs.forEach((d) => {
      const bucket = d.data()
      if (!bucket.placeId) return
      const acumulado = porLugar.get(bucket.placeId) || {
        placeId: bucket.placeId,
        placeName: '',
        total: 0,
        franjas: 0,
        ultimaMs: 0,
      }
      acumulado.total += bucket.total || 0
      acumulado.franjas += 1
      if (bucket.placeName) acumulado.placeName = bucket.placeName
      const ms = bucket.actualizadoEn?.toMillis?.() || 0
      if (ms > acumulado.ultimaMs) acumulado.ultimaMs = ms
      porLugar.set(bucket.placeId, acumulado)
    })
    callback([...porLugar.values()].sort((a, b) => b.total - a.total))
  })
}
