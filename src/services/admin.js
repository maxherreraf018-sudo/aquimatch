import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// UID de la única cuenta con acceso al panel (Max). Si en el futuro hay más
// de una persona en el equipo de moderación, esto se reemplaza por un
// sistema de roles; por ahora es un MVP simple y directo.
export const ADMIN_UID = 'CLdj1h5eVoS1RknR4flaEoMYZZf1'

/**
 * Escucha en tiempo real todos los perfiles con selfie pendiente de revisión.
 */
export function escucharSelfiesPendientes(callback) {
  const ref = collection(db, 'usuarios')
  const q = query(ref, where('estadoVerificacion', '==', 'pendiente'))
  return onSnapshot(q, (snapshot) => {
    const perfiles = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }))
    callback(perfiles)
  })
}

/**
 * Aprueba o rechaza la selfie de verificación de un usuario.
 */
export async function actualizarEstadoVerificacion(uid, nuevoEstado) {
  const ref = doc(db, 'usuarios', uid)
  await updateDoc(ref, { estadoVerificacion: nuevoEstado })
}

/**
 * Escucha en tiempo real los perfiles que la verificación automática
 * rechazó o no pudo procesar (error técnico) — para poder revisarlos a
 * mano y aprobarlos si Rekognition se equivocó.
 */
export function escucharSelfiesRechazadas(callback) {
  const ref = collection(db, 'usuarios')
  const q = query(ref, where('estadoVerificacion', 'in', ['rechazado', 'error_verificacion']))
  return onSnapshot(q, (snapshot) => {
    const perfiles = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }))
    callback(perfiles)
  })
}

/**
 * Escucha en tiempo real todos los reportes, del más nuevo al más antiguo.
 */
export function escucharReportes(callback) {
  const ref = collection(db, 'reportes')
  const q = query(ref, orderBy('creadoEn', 'desc'))
  return onSnapshot(q, (snapshot) => {
    const reportes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    callback(reportes)
  })
}

/**
 * Marca un reporte como revisado por el equipo.
 */
export async function marcarReporteRevisado(reporteId) {
  const ref = doc(db, 'reportes', reporteId)
  await updateDoc(ref, { revisado: true })
}
