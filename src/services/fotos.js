import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera'

export { CameraSource, CameraDirection }

// Reemplaza <input type="file">, que en la WebView de Android (sobre todo en
// Samsung) falla al elegir fotos desde la galería: las "selecciona" pero el
// resultado nunca llega al <input>. El picker nativo del plugin no tiene ese
// problema. Devuelve un Blob listo para subir a Storage, o null si la
// persona cancela (no se trata como error).
export async function elegirFoto({
  source = CameraSource.Prompt,
  direction,
  secundaria = false,
  recortar = false,
} = {}) {
  try {
    const foto = await Camera.getPhoto({
      // Recortador nativo del teléfono. Se activa solo para las fotos de
      // perfil, no para la selfie de verificación: ahí la persona no tiene que
      // encuadrar nada, y un paso extra en el registro es un paso donde se cae
      // gente.
      //
      // Es el arreglo de raíz del recorte que cortaba cabezas. Hoy la app
      // corrige el encuadre al 20% para que el círculo no se coma la cara,
      // pero eso es una aproximación que le queda bien a casi cualquier foto y
      // mal a las demás. Recortando al subir, cada uno encuadra la suya y el
      // círculo muestra exactamente eso.
      allowEditing: recortar,
      // Las fotos 2 y 3 se piden más chicas (720 en vez de 1080).
      //
      // La principal se deja grande porque es contra la que se compara la
      // selfie de verificación, y bajarle resolución le quitaría precisión a
      // ese control. Las secundarias solo se miran, así que 720 alcanza de
      // sobra en un teléfono y ocupan menos de la mitad.
      //
      // Importa para el espacio gratuito de Storage: son 5 GB, y a resolución
      // completa las tres fotos de una persona pesan cerca de 1 MB — o sea que
      // el techo estaba en unos 5.000 usuarios. Con esto se duplica.
      quality: secundaria ? 80 : 85,
      resultType: CameraResultType.DataUrl,
      source,
      // Sin este límite, la cámara nativa entrega fotos a resolución
      // completa (varios MB) — eso fue lo que hizo que la verificación de
      // selfie se quedara pegada: la función en la nube tiene 120s para
      // bajar y comparar las dos fotos, y con fotos pesadas no alcanza.
      width: secundaria ? 720 : 1080,
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
