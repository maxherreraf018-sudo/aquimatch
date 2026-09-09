import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/config'

// UID de la única cuenta con acceso al panel: maxherreraf018@gmail.com.
// Si en el futuro hay más de una persona en el equipo de moderación, esto se
// reemplaza por un sistema de roles; por ahora es un MVP simple y directo.
//
// Dejar SIEMPRE anotado a qué correo corresponde el uid: el anterior apuntaba
// a "max_15619@hotmail.com", una cuenta creada por error de tipeo que Max ni
// sabía que existía, así que nunca pudo entrar a su propio panel.
//
// Esto solo controla si el panel se MUESTRA. Quien realmente da o niega el
// acceso es la función esAdmin() de firestore.rules, en el servidor — las dos
// tienen que apuntar al mismo uid.
export const ADMIN_UID = 'SM1r3pWsTYU2soVHMUmOT1xzIfi2'

/**
 * Las selfies de verificación ya no viven en el documento público del usuario
 * (son un dato biométrico: ver los comentarios en firebase/auth.js), sino en
 * `usuarios/{uid}/privado/datos`, que solo pueden leer su dueño y este panel.
 * Por eso hay que ir a buscarlas de a una para poder mostrarlas acá.
 *
 * El `?? p.selfieVerificacion` cubre a las cuentas que todavía no migraron:
 * hasta que su dueño entre a la app una vez, la selfie sigue en el documento
 * público.
 */
async function conSelfies(perfiles) {
  const pedirUrl = httpsCallable(functions, 'urlSelfieModeracion')
  return Promise.all(
    perfiles.map(async (p) => {
      try {
        // Se le pide al servidor un enlace firmado, que se vence en minutos.
        //
        // Ya no se puede leer la selfie directamente: desde el 2026-09-05 el
        // archivo se sube SIN token de descarga, justamente para que un enlace
        // filtrado no quede abierto para siempre. El servidor es el único que
        // puede mirarlo, y firma un permiso temporal para esta pantalla.
        //
        // La función se hace cargo también de las cuentas viejas, que sí tienen
        // una URL guardada: en ese caso devuelve esa.
        const { data } = await pedirUrl({ uid: p.uid })
        return { ...p, selfieVerificacion: data?.url ?? p.selfieVerificacion }
      } catch (err) {
        // Si falla una, se muestra igual el resto de la lista.
        return p
      }
    })
  )
}

/**
 * Escucha en tiempo real todos los perfiles con selfie pendiente de revisión.
 */
export function escucharSelfiesPendientes(callback) {
  const ref = collection(db, 'usuarios')
  const q = query(ref, where('estadoVerificacion', '==', 'pendiente'))
  return onSnapshot(q, (snapshot) => {
    const perfiles = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }))
    conSelfies(perfiles).then(callback)
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
    conSelfies(perfiles).then(callback)
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
 * Lista de espera de la suscripción Gold. Es el único lugar donde se puede ver
 * el resultado del experimento de precio: cuánta gente tocó "avísame" y con
 * qué plan se quedó mirando. Sin esto los datos se juntan y nadie los mira.
 */
export function escucharInteresGold(callback) {
  const ref = collection(db, 'interesGold')
  const q = query(ref, orderBy('creadoEn', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })))
  })
}

/**
 * Marca un reporte como revisado por el equipo.
 */
export async function marcarReporteRevisado(reporteId) {
  const ref = doc(db, 'reportes', reporteId)
  await updateDoc(ref, { revisado: true })
}

/**
 * Resumen general de cómo va la app. Solo responde al administrador — la
 * comprobación de verdad está en la función, no acá.
 *
 * El número que importa no son las descargas (esas están en Play Console) sino
 * `horasConCoincidencia`: cuántas veces dos personas estuvieron activadas en
 * el mismo local a la misma hora. Es lo único que dice si la app está
 * funcionando o si es una lista de contactos que nadie usa.
 */
export async function obtenerResumenGeneral() {
  const llamar = httpsCallable(functions, 'resumenGeneral')
  const { data } = await llamar()
  return data
}
