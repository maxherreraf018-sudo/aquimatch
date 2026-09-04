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
//
// Hoy los dos números NO coinciden entre tiendas: Android va en 1.22 (24) e
// iOS sigue en 1.0 (22), esperando la primera aprobación de Apple. Este
// archivo sigue el de Android; hay que corregirlo al armar el paquete de iOS.
export const VERSION_NOMBRE = '1.22'
export const VERSION_BUILD = 24
