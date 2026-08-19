import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// ---------------------------------------------------------------------------
// Ubicación del teléfono
//
// Antes la app pedía la ubicación con `navigator.geolocation`, la función del
// navegador. Dentro de la app empacada eso funciona, pero en iPhone hace que
// WebKit muestre un SEGUNDO diálogo de permiso —redundante y titulado
// "localhost"— después del diálogo nativo que la persona ya aceptó. Se detectó
// en el iPhone de un amigo de Max, y es de las cosas que hacen desconfiar de
// una app en el primer minuto de uso.
//
// Con el plugin nativo el pedido pasa directo al permiso del sistema y sale un
// solo diálogo, con el texto en español que ya está declarado en Info.plist.
//
// En el navegador (desarrollo) se sigue usando la función de siempre: el
// plugin ahí no aporta nada.
//
// Esta es la ruta más crítica de la app: si esto falla, nadie puede activarse
// en ningún lugar. Por eso vive en un solo archivo y no repetida en cada
// pantalla.
// ---------------------------------------------------------------------------

const OPCIONES = { enableHighAccuracy: true, timeout: 15000 }

export function hayUbicacionDisponible() {
  return Capacitor.isNativePlatform() || Boolean(navigator.geolocation)
}

/**
 * Pide la ubicación actual una vez. Devuelve { lat, lng }.
 * Lanza si la persona no da permiso o si el GPS no responde a tiempo.
 */
export async function obtenerPosicion() {
  if (Capacitor.isNativePlatform()) {
    // En iOS el permiso hay que pedirlo explícitamente la primera vez; si ya
    // está concedido, checkPermissions devuelve 'granted' y no molesta a nadie.
    const estado = await Geolocation.checkPermissions()
    if (estado.location !== 'granted') {
      const pedido = await Geolocation.requestPermissions()
      if (pedido.location !== 'granted') {
        throw new Error('Sin permiso de ubicación')
      }
    }
    const posicion = await Geolocation.getCurrentPosition(OPCIONES)
    return { lat: posicion.coords.latitude, lng: posicion.coords.longitude }
  }

  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) {
      rechazar(new Error('Este dispositivo no puede entregar tu ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) =>
        resolver({ lat: posicion.coords.latitude, lng: posicion.coords.longitude }),
      (error) => rechazar(error),
      OPCIONES
    )
  })
}

/**
 * Vigila la posición hasta que se llame a la función que devuelve.
 *
 * Cuidado con lo que resuelve esto: en la versión nativa, el identificador de
 * la vigilancia llega en una promesa. Si la pantalla se cierra antes de que
 * esa promesa resuelva, un `clearWatch` ingenuo no encuentra nada que apagar y
 * el GPS queda encendido para siempre — gastando batería y siguiendo a la
 * persona después de que salió de la pantalla. Por eso el apagado espera a que
 * el identificador exista, y se marca `cancelado` para el caso de que la
 * pantalla se cierre primero.
 */
export function vigilarPosicion(alMoverse) {
  let cancelado = false

  if (Capacitor.isNativePlatform()) {
    const idPrometido = Geolocation.watchPosition(OPCIONES, (posicion) => {
      if (cancelado || !posicion) return
      alMoverse({ lat: posicion.coords.latitude, lng: posicion.coords.longitude })
    })
    return () => {
      cancelado = true
      idPrometido
        .then((id) => Geolocation.clearWatch({ id }))
        .catch(() => {})
    }
  }

  if (!navigator.geolocation) return () => {}
  const id = navigator.geolocation.watchPosition(
    (posicion) => {
      if (cancelado) return
      alMoverse({ lat: posicion.coords.latitude, lng: posicion.coords.longitude })
    },
    () => {},
    OPCIONES
  )
  return () => {
    cancelado = true
    navigator.geolocation.clearWatch(id)
  }
}
