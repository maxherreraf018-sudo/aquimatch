import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

// Cuánto tiempo se muestra un aviso. Tiene que coincidir con VIGENCIA_AVISO_MS
// del servidor: si acá fuera mayor, se mostrarían avisos que el dueño ya da por
// vencidos, hablando de una promoción que se acabó.
const VIGENCIA_AVISO_MS = 3 * 60 * 60 * 1000

const CLAVE_DESCARTADOS = 'aquimatch.avisosDescartados'

// Los avisos que esta persona ya cerró con la X. Viven solo en su teléfono: no
// tiene ningún interés para nosotros saber quién cerró qué cartel de un bar, y
// guardarlo en el servidor sería una escritura por persona y por aviso.
function leerDescartados() {
  try {
    const crudo = localStorage.getItem(CLAVE_DESCARTADOS)
    const lista = crudo ? JSON.parse(crudo) : []
    return Array.isArray(lista) ? lista : []
  } catch (err) {
    return []
  }
}

export function descartarAviso(id) {
  try {
    // Se guardan los últimos 30 y no todos: la lista crecería para siempre en
    // el teléfono de alguien que sale seguido, y un aviso de hace un mes ya
    // venció en el servidor igual.
    const lista = [id, ...leerDescartados().filter((x) => x !== id)].slice(0, 30)
    localStorage.setItem(CLAVE_DESCARTADOS, JSON.stringify(lista))
  } catch (err) {
    // Sin poder guardarlo, el aviso vuelve a aparecer. Molesto, no grave.
  }
}

/**
 * Escucha los avisos vigentes del lugar donde está la persona.
 *
 * `callback` recibe el más reciente que no haya sido descartado, o null. Se
 * muestra uno solo a propósito: son carteles de un bar, y apilar tres tapa la
 * pantalla de alguien que está conversando.
 */
export function escucharAvisoDelLugar(placeId, callback) {
  if (!placeId) return () => {}
  const q = query(
    collection(db, 'avisos'),
    where('placeId', '==', placeId),
    orderBy('creadoEnMs', 'desc')
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const ahora = Date.now()
      const descartados = leerDescartados()
      const vigente = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .find(
          (a) =>
            a.creadoEnMs &&
            ahora - a.creadoEnMs < VIGENCIA_AVISO_MS &&
            !descartados.includes(a.id)
        )
      callback(vigente || null)
    },
    () => {
      // Un aviso es un extra: si la consulta falla (falta el índice, sin red),
      // la pantalla de Estado tiene que seguir funcionando igual.
      callback(null)
    }
  )
}
