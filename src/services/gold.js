import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { db } from '../firebase/config'
import { registrarEvento } from '../firebase/analytics'

// ---------------------------------------------------------------------------
// Interés en la suscripción Gold — lista de espera, NO cobro
//
// La app sale gratis, pero la pantalla de Gold ya se muestra con sus funciones
// y sus precios reales y un botón de "avísame". Es la única forma de saber si
// alguien pagaría ANTES de construir todo el cobro: si nadie toca ese botón,
// la suscripción no se salva con mejores funciones, y nos ahorramos la semana
// de trabajo de integrar RevenueCat.
//
// A propósito no hay ningún flujo de compra acá. Cobrar antes de que la app
// tenga gente activa en los locales significa venderle a alguien un beneficio
// que va a abrir y no va a ver a nadie: eso termina en reembolso y en una
// reseña de una estrella que después se arrastra para siempre.
// ---------------------------------------------------------------------------

export const PRECIO_MENSUAL = 4990
export const PRECIO_ANUAL = 39990

// Se calcula en vez de escribirlo a mano: si mañana cambia un precio, la
// etiqueta de "ahorra X%" no puede quedar mintiendo.
export const AHORRO_ANUAL_PORCENTAJE = Math.round(
  (1 - PRECIO_ANUAL / (PRECIO_MENSUAL * 12)) * 100
)

// Formato chileno ($4.990) hecho a mano en vez de con toLocaleString, que en
// los WebView viejos de Android puede no traer los datos de configuración
// regional y devolver "4990" sin separador.
export function formatearCLP(monto) {
  return '$' + String(monto).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const PLANES_VALIDOS = ['mensual', 'anual', 'sin_elegir']

function refInteres(uid) {
  return doc(db, 'interesGold', uid)
}

export async function obtenerInteresGold(uid) {
  const snap = await getDoc(refInteres(uid))
  return snap.exists() ? snap.data() : null
}

/**
 * Deja anotado que a esta persona le interesa Gold, y con qué plan se quedó
 * mirando. Guardar el plan es la mitad del valor del experimento: saber si la
 * gente elige mensual o anual cambia el precio con el que conviene lanzar.
 */
export async function registrarInteresGold(uid, plan) {
  const planGuardado = PLANES_VALIDOS.includes(plan) ? plan : 'sin_elegir'
  await setDoc(refInteres(uid), {
    creadoEn: serverTimestamp(),
    plan: planGuardado,
    plataforma: Capacitor.getPlatform(),
  })
  await registrarEvento('gold_interes_registrado', { plan: planGuardado })
}

export async function cancelarInteresGold(uid) {
  await deleteDoc(refInteres(uid))
  await registrarEvento('gold_interes_cancelado')
}
