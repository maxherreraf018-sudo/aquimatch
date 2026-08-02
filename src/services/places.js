// Búsqueda de lugares cercanos usando Google Places API (New)
// Requiere una API Key de Google Cloud con "Places API (New)" habilitada.
// La key se configura en el archivo .env como VITE_GOOGLE_PLACES_API_KEY
const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY
// Tipos de lugares que nos interesan para AquiMatch
const TIPOS_RELEVANTES = [
  'bar',
  'night_club',
  'restaurant',
  'cafe',
  'pub',
]
// Radio de búsqueda: exige estar cerca de verdad para poder activarte en un
// lugar, sin importar el tipo. El radio más grande para universidades/
// estadios (ver activation.js) aplica solo DESPUÉS de haberte activado acá
// cerca, para no expulsarte mientras caminás por un campus/recinto grande —
// nunca para el paso inicial de encontrar el lugar, porque eso permitiría
// que alguien en su casa, a varias cuadras, vea una universidad como
// "disponible" sin estar ahí en realidad.
const RADIO_BUSQUEDA_METROS = 120
const MAX_LUGARES_MOSTRADOS = 2

/**
 * Busca lugares cercanos a una coordenada usando Google Places (Nearby Search New).
 * Devuelve una lista corta (máx 2) ordenada por cercanía.
 */
export async function buscarLugaresCercanos(lat, lng) {
  if (!API_KEY) {
    throw new Error(
      'Falta configurar VITE_GOOGLE_PLACES_API_KEY en el archivo .env'
    )
  }
  const respuesta = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.types,places.formattedAddress',
    },
    body: JSON.stringify({
      includedTypes: TIPOS_RELEVANTES,
      maxResultCount: 5,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: RADIO_BUSQUEDA_METROS,
        },
      },
    }),
  })
  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    throw new Error(`Error al buscar lugares: ${detalle}`)
  }
  const datos = await respuesta.json()
  const lugares = datos.places || []
  return lugares
    .map((lugar) => ({
      placeId: lugar.id,
      nombre: lugar.displayName?.text || 'Lugar sin nombre',
      direccion: lugar.formattedAddress || '',
      tipos: lugar.types || [],
      lat: lugar.location?.latitude,
      lng: lugar.location?.longitude,
      distanciaMetros: calcularDistanciaMetros(
        lat,
        lng,
        lugar.location?.latitude,
        lugar.location?.longitude
      ),
    }))
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
    .slice(0, MAX_LUGARES_MOSTRADOS)
}
/**
 * Distancia entre dos coordenadas usando la fórmula de Haversine (en metros).
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
