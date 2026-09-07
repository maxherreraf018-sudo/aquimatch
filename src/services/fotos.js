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
      // Recortador nativo del teléfono.
      //
      // APAGADO EN TODAS PARTES desde el 2026-09-05, el mismo día que se
      // encendió. En Android no es una pantalla nuestra: es la que traiga el
      // teléfono, y en el Galaxy de Max apareció como un recuadro chico y
      // pobre que dice "Editar foto". En iPhone se ve bastante mejor, pero eso
      // no arregla lo que ve la mayoría de la gente, que está en Android.
      //
      // El problema que venía a resolver sigue existiendo: el círculo del
      // perfil recorta, y hoy se compensa con un encuadre fijo al 20% que le
      // queda bien a casi cualquier foto de una persona parada y mal a las
      // demás. La solución buena es un recortador propio, dentro de la app,
      // igual en las dos plataformas — medio día de trabajo, y no valía la
      // pena trabar el paquete 25 por esto.
      //
      // El parámetro se deja puesto para poder volver a probarlo sin rehacer
      // nada. Nunca en la selfie de verificación: ahí no hay nada que
      // encuadrar, y un paso extra en el registro es un paso donde se cae
      // gente.
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
