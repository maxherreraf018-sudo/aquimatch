import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'
import { olvidarLugares } from './misLugares'

// Borra perfil, fotos, activación e "intereses"/"pases" propios, y la
// cuenta de login — ver detalle en functions/index.js (eliminarCuenta).
export async function eliminarCuenta() {
  const llamar = httpsCallable(functions, 'eliminarCuenta')
  await llamar()
  // La lista de tus lugares nunca estuvo en el servidor, así que la función de
  // arriba no la puede borrar: vive solo en este teléfono. Si no se limpiara
  // acá, alguien que borra su cuenta dejaría en el aparato el registro de a
  // qué bares salía — justo lo que fue a eliminar.
  olvidarLugares()
}
