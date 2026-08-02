import { useEffect, useRef } from 'react'
import { calcularDistanciaMetros } from '../services/places'
import { radioSalidaSegunTipos } from '../services/activation'

// Vigila la posición mientras haya un lugar activo (en cualquier pantalla
// que la use, no solo Activación); si el GPS reporta 3 lecturas seguidas
// fuera del radio permitido, avisa que la persona se fue de verdad.
export default function useVigilanciaSalida(lugar, onSalir) {
  const watchIdRef = useRef(null)

  useEffect(() => {
    if (!lugar?.placeId || lugar.lat == null || lugar.lng == null) return
    const radioSalida = radioSalidaSegunTipos(lugar.tipos)
    let lecturasFueraDeRango = 0
    watchIdRef.current = navigator.geolocation.watchPosition(
      (posicion) => {
        const distancia = calcularDistanciaMetros(
          posicion.coords.latitude,
          posicion.coords.longitude,
          lugar.lat,
          lugar.lng
        )
        if (distancia > radioSalida) {
          lecturasFueraDeRango += 1
        } else {
          lecturasFueraDeRango = 0
        }
        if (lecturasFueraDeRango >= 3) {
          onSalir()
        }
      },
      () => {},
      { enableHighAccuracy: true }
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lugar?.placeId])
}
