// Versión que se le muestra a la persona en "Configuración de la cuenta".
//
// OJO: hay que mantenerla a mano igual a la de las tiendas, en los dos
// archivos de siempre, cada vez que se arma un paquete:
//   - android/app/build.gradle  → versionName / versionCode
//   - ios/App/App.xcodeproj     → MARKETING_VERSION / CURRENT_PROJECT_VERSION
//
// No se lee sola de ahí a propósito: la app corre desde el navegador dentro
// de Capacitor y no tiene acceso al build.gradle. Si algún día se desincroniza,
// lo peor que pasa es que un reporte de soporte apunte a la versión equivocada
// — molesto, pero no rompe nada.
export const VERSION_NOMBRE = '1.22'
export const VERSION_BUILD = 24
