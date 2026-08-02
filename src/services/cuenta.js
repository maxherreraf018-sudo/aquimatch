import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

// Borra perfil, fotos, activación e "intereses"/"pases" propios, y la
// cuenta de login — ver detalle en functions/index.js (eliminarCuenta).
export async function eliminarCuenta() {
  const llamar = httpsCallable(functions, 'eliminarCuenta')
  await llamar()
}
