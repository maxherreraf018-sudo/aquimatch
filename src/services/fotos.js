import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera'

export { CameraSource, CameraDirection }

// Reemplaza <input type="file">, que en la WebView de Android (sobre todo en
// Samsung) falla al elegir fotos desde la galería: las "selecciona" pero el
// resultado nunca llega al <input>. El picker nativo del plugin no tiene ese
// problema. Devuelve un Blob listo para subir a Storage, o null si la
// persona cancela (no se trata como error).
export async function elegirFoto({ source = CameraSource.Prompt, direction } = {}) {
  try {
    const foto = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source,
      // Sin este límite, la cámara nativa entrega fotos a resolución
      // completa (varios MB) — eso fue lo que hizo que la verificación de
      // selfie se quedara pegada: la función en la nube tiene 120s para
      // bajar y comparar las dos fotos, y con fotos pesadas no alcanza.
      width: 1080,
      ...(direction ? { direction } : {}),
      promptLabelHeader: 'Foto',
      promptLabelPhoto: 'Desde galería',
      promptLabelPicture: 'Tomar foto',
      promptLabelCancel: 'Cancelar',
    })
    const respuesta = await fetch(foto.dataUrl)
    return await respuesta.blob()
  } catch (err) {
    const mensaje = String(err?.message || '').toLowerCase()
    if (mensaje.includes('cancel')) return null
    throw err
  }
}
