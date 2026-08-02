import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'

// Si una promesa no responde en X segundos, la damos por fallida en vez de
// esperar para siempre (protección contra cuelgues silenciosos de red).
export function conLimiteDeTiempo(promesa, segundos, etiqueta) {
  return Promise.race([
    promesa,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT: ${etiqueta} no respondió en ${segundos}s`)), segundos * 1000)
    ),
  ])
}

// Sube la selfie de verificación al Storage y devuelve su URL. Se usa tanto
// al completar el perfil por primera vez como al reintentar tras un rechazo.
export async function subirSelfieAlStorage(uid, archivo) {
  const storageRef = ref(storage, `selfies-verificacion/${uid}/selfie.jpg`)
  await conLimiteDeTiempo(uploadBytes(storageRef, archivo), 25, 'uploadBytes')
  return conLimiteDeTiempo(getDownloadURL(storageRef), 25, 'getDownloadURL')
}
