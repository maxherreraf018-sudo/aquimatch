import { ref, uploadBytes } from 'firebase/storage'
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

/**
 * Sube la selfie de verificación y devuelve su RUTA, no una URL.
 *
 * ANTES DEVOLVÍA UNA URL Y ESE ERA EL PROBLEMA. `getDownloadURL()` no solo
 * arma una dirección: le pega al archivo un token permanente que lo vuelve
 * descargable por cualquiera que tenga el enlace, sin necesidad de haber
 * iniciado sesión. Y esto es una selfie — un dato biométrico. Un enlace
 * filtrado en un registro, en una captura o en una copia de la base de datos
 * quedaba abierto para siempre.
 *
 * Al no llamar nunca a getDownloadURL, el archivo no llega a tener token: solo
 * se puede leer con sesión iniciada (las reglas lo limitan a su dueño) o desde
 * el servidor. La verificación lo lee con permisos de servidor, y el panel de
 * moderación pide un enlace firmado que se vence en minutos.
 */
export async function subirSelfieAlStorage(uid, archivo) {
  const ruta = `selfies-verificacion/${uid}/selfie.jpg`
  await conLimiteDeTiempo(uploadBytes(ref(storage, ruta), archivo), 25, 'uploadBytes')
  return ruta
}
