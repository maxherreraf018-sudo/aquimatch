import { FirebaseAnalytics } from '@capacitor-firebase/analytics'

// Wrapper con try/catch: la analítica nunca debe romper el flujo real de la
// app si por algún motivo el plugin nativo falla o no está disponible
// (por ejemplo, corriendo en el navegador durante desarrollo).
export async function registrarEvento(nombre, params = {}) {
  try {
    await FirebaseAnalytics.logEvent({ name: nombre, params })
  } catch (error) {
    console.warn('No se pudo registrar el evento de analítica:', nombre, error)
  }
}
