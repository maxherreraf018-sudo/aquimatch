import { Capacitor } from '@capacitor/core'
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics'

// Crashlytics por sí solo captura fallos nativos (Java/Kotlin), pero NO los
// errores de JavaScript dentro del WebView — hay que reenviarlos a mano.
// Sin esto, un error de React que rompe una pantalla queda invisible salvo
// que el usuario nos escriba directamente.
export function registrarErroresGlobales() {
  if (!Capacitor.isNativePlatform()) return

  window.addEventListener('error', (evento) => {
    const mensaje = evento.error?.stack || evento.message || 'Error desconocido'
    FirebaseCrashlytics.recordException({ message: String(mensaje).slice(0, 2000) })
  })

  window.addEventListener('unhandledrejection', (evento) => {
    const razon = evento.reason
    const mensaje = razon?.stack || razon?.message || String(razon) || 'Promesa rechazada sin razón'
    FirebaseCrashlytics.recordException({ message: String(mensaje).slice(0, 2000) })
  })
}
