import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

export { CameraSource, CameraDirection }

// ---------------------------------------------------------------------------
// Por qué esta pantalla hace el trabajo que debería hacer el plugin
//
// Una foto sacada con el teléfono de lado casi nunca se guarda girada. Los
// píxeles quedan acostados y el archivo trae una etiqueta EXIF ("Orientation")
// que dice cómo hay que girarlos al mostrarla. Todas las galerías la leen, así
// que en el teléfono la foto se ve derecha y nadie sospecha nada.
//
// Capacitor, al redimensionar la foto, la vuelve a codificar: BORRA esa
// etiqueta y NO gira los píxeles. Se supone que `correctOrientation` lo
// resuelve, y en la cámara sí, pero en la galería de Android no — llama a
// `exif.resetOrientation()`, que solo pone la etiqueta en 1 sin tocar la
// imagen. Resultado: la foto sale acostada, y el dato que decía cómo
// arreglarla ya no existe. Comprobado en el S23 de Max: llegaba 1600x899, sin
// etiqueta. Tres intentos de arreglarlo desde afuera fallaron por eso — para
// cuando la veíamos, la información ya se había perdido.
//
// Así que se le pide a Capacitor el archivo TAL CUAL (`Uri`, sin `width` ni
// `quality`, que son los que disparan la recodificación), y acá se lee la
// etiqueta, se gira y se achica. La ventaja de paso es que el tamaño final lo
// decidimos nosotros y no el plugin.
//
// Si cualquier cosa de esto falla, se vuelve al camino viejo. Una foto
// acostada es un problema; una foto que no se puede subir es uno peor.
// ---------------------------------------------------------------------------

/**
 * Recorre los marcadores de un JPEG y saca dos cosas: la orientación EXIF y el
 * tamaño REAL en píxeles con el que está guardado (el del marcador SOF, antes
 * de que nadie lo gire). El segundo dato parece de más y es justamente el que
 * hace que esto funcione — abajo se explica para qué.
 *
 * Devuelve orientación 1 ("derecha, no tocar") ante cualquier duda: preferimos
 * dejar una foto como está antes que girar una que no había que girar.
 */
function leerJpeg(buffer) {
  try {
    const vista = new DataView(buffer)
    if (vista.getUint16(0, false) !== 0xffd8) return { orientacion: 1, ancho: 0, alto: 0 }

    let posicion = 2
    let orientacion = 1
    let ancho = 0
    let alto = 0

    while (posicion < vista.byteLength - 8) {
      if (vista.getUint8(posicion) !== 0xff) break
      const marcador = vista.getUint8(posicion + 1)

      // Marcadores sin contenido: se saltan de a dos bytes.
      if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
        posicion += 2
        continue
      }
      // Empiezan los datos comprimidos de la imagen: de acá en adelante no hay
      // más cabeceras que leer.
      if (marcador === 0xda) break

      const largo = vista.getUint16(posicion + 2, false)
      if (largo < 2) break

      // SOF: el tamaño con el que la imagen está realmente guardada. Son
      // varios marcadores (C0..CF) menos tres que significan otra cosa.
      const esSOF =
        marcador >= 0xc0 && marcador <= 0xcf &&
        marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc
      if (esSOF && !ancho) {
        alto = vista.getUint16(posicion + 5, false)
        ancho = vista.getUint16(posicion + 7, false)
      }

      // APP1 es donde vive el EXIF. Tiene que empezar con "Exif": hay otros
      // APP1 (XMP, por ejemplo) que no lo son.
      if (marcador === 0xe1 && vista.getUint32(posicion + 4, false) === 0x45786966) {
        const tiff = posicion + 10
        const alRevés = vista.getUint16(tiff, false) === 0x4949 // "II" = little endian
        const primeraTabla = vista.getUint32(tiff + 4, alRevés)
        const cuantas = vista.getUint16(tiff + primeraTabla, alRevés)
        for (let i = 0; i < cuantas; i++) {
          const entrada = tiff + primeraTabla + 2 + i * 12
          if (entrada + 12 > vista.byteLength) break
          if (vista.getUint16(entrada, alRevés) === 0x0112) {
            const valor = vista.getUint16(entrada + 8, alRevés)
            if (valor >= 1 && valor <= 8) orientacion = valor
            break
          }
        }
      }

      posicion += 2 + largo
    }

    return { orientacion, ancho, alto }
  } catch {
    return { orientacion: 1, ancho: 0, alto: 0 }
  }
}

/**
 * Dibuja la imagen ya girada y achicada, y devuelve el lienzo.
 *
 * Los ocho casos de la etiqueta EXIF son seis giros y dos espejos. Cuando la
 * foto queda de canto (5 a 8) el lienzo va con el ancho y el alto cambiados.
 */
function dibujarDerecha(imagen, orientacion, anchoMaximo) {
  const escala = Math.min(1, anchoMaximo / imagen.naturalWidth)
  const ancho = Math.round(imagen.naturalWidth * escala)
  const alto = Math.round(imagen.naturalHeight * escala)
  const deCanto = orientacion >= 5

  const lienzo = document.createElement('canvas')
  lienzo.width = deCanto ? alto : ancho
  lienzo.height = deCanto ? ancho : alto

  // `willReadFrequently: true` no es un detalle: es el arreglo.
  //
  // Medido en el S23 el 2026-09-09: preparar una foto tardaba 1.307 ms, y de
  // esos, 1.291 estaban acá — en dibujar y comprimir. Decodificar la imagen
  // costaba 10 ms. (Dos intentos anteriores fueron a optimizar la
  // decodificación, que era lo que parecía caro y no lo era.)
  //
  // El motivo: por defecto el navegador guarda el lienzo en memoria de la
  // tarjeta gráfica, que es lo correcto para algo que se dibuja en pantalla.
  // Pero nosotros no lo mostramos: lo leemos entero para sacar el JPEG, y
  // traer esos píxeles de vuelta desde la gráfica es lentísimo en un teléfono.
  // Con esta bandera el lienzo vive en memoria normal desde el principio y no
  // hay nada que traer de vuelta.
  const pincel = lienzo.getContext('2d', { willReadFrequently: true })
  switch (orientacion) {
    case 2: pincel.transform(-1, 0, 0, 1, ancho, 0); break
    case 3: pincel.transform(-1, 0, 0, -1, ancho, alto); break
    case 4: pincel.transform(1, 0, 0, -1, 0, alto); break
    case 5: pincel.transform(0, 1, 1, 0, 0, 0); break
    case 6: pincel.transform(0, 1, -1, 0, alto, 0); break
    case 7: pincel.transform(0, -1, -1, 0, alto, ancho); break
    case 8: pincel.transform(0, -1, 1, 0, 0, ancho); break
    default: break
  }
  pincel.drawImage(imagen, 0, 0, ancho, alto)
  return lienzo
}

function cargarImagen(url) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    // Chrome gira las fotos por su cuenta al dibujarlas en un lienzo desde que
    // `image-orientation: from-image` es el valor por defecto. Si lo hiciera y
    // además girásemos nosotros, la foto quedaría peor que antes. Acá se le
    // pide explícitamente que no toque nada; abajo, además, se comprueba que
    // haya hecho caso.
    imagen.style.imageOrientation = 'none'
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error('no se pudo leer la foto'))
    imagen.src = url
  })
}

/**
 * Toma el archivo original, lo deja derecho y lo achica. Devuelve un Blob JPEG
 * listo para subir.
 */
async function enderezar(blobOriginal, anchoMaximo, calidad) {
  const { orientacion, ancho: anchoGuardado, alto: altoGuardado } =
    leerJpeg(await blobOriginal.arrayBuffer())

  const url = URL.createObjectURL(blobOriginal)
  try {
    const imagen = await cargarImagen(url)

    // La red de seguridad, y el motivo de haber leído el tamaño del archivo.
    //
    // Si el navegador ignoró el `imageOrientation: 'none'` de arriba y giró la
    // foto igual, lo delata su propio tamaño: nos entrega alto por ancho
    // cambiados respecto de lo que dice el archivo. En ese caso la foto YA
    // está derecha y girarla de nuevo la dejaría de cabeza.
    const yaLaGiróElNavegador =
      orientacion >= 5 &&
      anchoGuardado > 0 &&
      imagen.naturalWidth === altoGuardado &&
      imagen.naturalHeight === anchoGuardado

    const lienzo = dibujarDerecha(imagen, yaLaGiróElNavegador ? 1 : orientacion, anchoMaximo)
    const blob = await new Promise((resolver) =>
      lienzo.toBlob(resolver, 'image/jpeg', calidad)
    )
    if (!blob) throw new Error('el lienzo no devolvió nada')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
  // Se llama justo cuando la galería ya se cerró y empieza el trabajo nuestro,
  // que dura unos segundos. Sirve para que la pantalla pueda avisar que está
  // preparando la foto en vez de quedarse igual que antes, como si nada
  // hubiera pasado. Si no se pasa, no cambia nada.
  alEmpezarAPreparar,
} = {}) {
  // Las fotos 2 y 3 se piden más chicas (720 en vez de 1080).
  //
  // La principal se deja grande porque es contra la que se compara la selfie
  // de verificación, y bajarle resolución le quitaría precisión a ese control.
  // Las secundarias solo se miran, así que 720 alcanza de sobra en un teléfono
  // y ocupan menos de la mitad.
  //
  // Importa para el espacio gratuito de Storage: son 5 GB, y a resolución
  // completa las tres fotos de una persona pesan cerca de 1 MB — o sea que el
  // techo estaba en unos 5.000 usuarios. Con esto se duplica.
  const anchoMaximo = secundaria ? 720 : 1080
  const calidad = secundaria ? 0.8 : 0.85

  const comunes = {
    // Recortador nativo del teléfono.
    //
    // APAGADO EN TODAS PARTES desde el 2026-09-05, el mismo día que se
    // encendió. En Android no es una pantalla nuestra: es la que traiga el
    // teléfono, y en el Galaxy de Max apareció como un recuadro chico y pobre
    // que dice "Editar foto". En iPhone se ve bastante mejor, pero eso no
    // arregla lo que ve la mayoría de la gente, que está en Android.
    //
    // El problema que venía a resolver sigue existiendo: el círculo del perfil
    // recorta, y hoy se compensa con un encuadre fijo al 20% que le queda bien
    // a casi cualquier foto de una persona parada y mal a las demás. La
    // solución buena es un recortador propio, dentro de la app, igual en las
    // dos plataformas.
    //
    // El parámetro se deja puesto para poder volver a probarlo sin rehacer
    // nada. Nunca en la selfie de verificación: ahí no hay nada que encuadrar,
    // y un paso extra en el registro es un paso donde se cae gente.
    allowEditing: recortar,
    source,
    ...(direction ? { direction } : {}),
    promptLabelHeader: 'Foto',
    promptLabelPhoto: 'Desde galería',
    promptLabelPicture: 'Tomar foto',
    promptLabelCancel: 'Cancelar',
  }

  // Paso 1: conseguir el archivo original, sin que el plugin lo toque. Nada de
  // `width` ni `quality`, que son los que disparan la recodificación, y
  // `correctOrientation: false` para que tampoco lo intente por su cuenta.
  let original = null
  try {
    const foto = await Camera.getPhoto({
      ...comunes,
      resultType: CameraResultType.Uri,
      correctOrientation: false,
    })
    const ruta = foto.webPath || foto.path
    if (!ruta) throw new Error('la foto llegó sin ruta')
    // Desde acá para abajo ya no hay ninguna pantalla del teléfono encima: la
    // persona está mirando la nuestra, y le toca esperarnos.
    alEmpezarAPreparar?.()
    const respuesta = await fetch(Capacitor.convertFileSrc(ruta))
    original = await respuesta.blob()
  } catch (err) {
    if (String(err?.message || '').toLowerCase().includes('cancel')) return null

    // Acá no llegamos a tener la foto, así que no queda más que volver a
    // pedirla, por el camino de siempre. Puede salir acostada, pero sale: que
    // alguien no pueda subir foto lo deja fuera de la app entera, porque sin
    // foto de perfil no hay verificación de selfie.
    console.warn('[fotos] no se pudo leer el archivo original:', err)
    try {
      const foto = await Camera.getPhoto({
        ...comunes,
        quality: Math.round(calidad * 100),
        resultType: CameraResultType.DataUrl,
        width: anchoMaximo,
      })
      return await (await fetch(foto.dataUrl)).blob()
    } catch (err2) {
      if (String(err2?.message || '').toLowerCase().includes('cancel')) return null
      throw err2
    }
  }

  // Paso 2: enderezarla y achicarla. Si esto falla la foto ya la tenemos, así
  // que NO se le vuelve a abrir la galería —elegir dos veces la misma foto es
  // de app rota— y se sube tal como vino.
  try {
    return await enderezar(original, anchoMaximo, calidad)
  } catch (err) {
    console.warn('[fotos] no se pudo enderezar, se sube como vino:', err)
    return original
  }
}
