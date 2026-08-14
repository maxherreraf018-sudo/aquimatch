// Búsqueda de lugares cercanos.
//
// Hasta el 2026-08-14 este archivo llamaba a Google Places directamente desde
// el teléfono, con la clave de API incrustada en el código publicado. Eso es
// inevitable en cualquier app que consulte Places desde el cliente — y también
// significa que cualquiera podía extraerla del APK y gastarla con cargo a la
// tarjeta de AquíMatch, porque Places es el costo dominante del proyecto.
//
// Ahora la consulta la hace una Cloud Function (`buscarLugares`), con la clave
// guardada como secreto del servidor. En la app ya no queda ninguna clave de
// Places, ni el caché, ni la lógica de radios: todo eso vive en un solo lugar,
// donde además se puede limitar el uso por persona.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

/**
 * Devuelve los lugares donde la persona puede activarse, ya filtrados por
 * cercanía real y ordenados del más cerca al más lejos.
 *
 * Cada elemento trae: placeId, nombre, direccion, tipos, lat, lng y
 * distanciaMetros.
 */
export async function buscarLugaresCercanos(lat, lng) {
  const llamar = httpsCallable(functions, 'buscarLugares')
  const { data } = await llamar({ lat, lng })
  return data || []
}

/**
 * Distancia entre dos coordenadas usando la fórmula de Haversine (en metros).
 *
 * Se queda del lado de la app porque `useVigilanciaSalida` la usa muchas veces
 * por minuto para detectar que alguien se fue del lugar: es una cuenta pura,
 * sin datos secretos, y mandarla al servidor sería absurdo.
 */
export function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  if (lat2 == null || lng2 == null) return Infinity
  const R = 6371000
  const rad = (grados) => (grados * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
