// Búsqueda de lugares cercanos usando Google Places API (New)
// Requiere una API Key de Google Cloud con "Places API (New)" habilitada.
// La key se configura en el archivo .env como VITE_GOOGLE_PLACES_API_KEY
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

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

// Cuánto tiempo se reutiliza, para cualquier usuario que se active cerca del
// mismo punto, la respuesta ya obtenida de Google Places — así diez personas
// activándose en el mismo bar en pocos minutos generan una sola consulta
// pagada en vez de diez. No afecta en nada la verificación de que cada
// persona está realmente ahí: eso se sigue calculando en el momento, para
// las coordenadas exactas de quien pregunta (ver más abajo).
const DURACION_CACHE_MS = 5 * 60 * 1000

/**
 * Agrupa coordenadas cercanas en la misma "zona" de caché, redondeando a
 * ~100m. Dos activaciones dentro de esa misma zona comparten la respuesta
 * de Google en vez de pedirla de nuevo cada vez.
 */
function idZonaCache(lat, lng) {
  const lat3 = lat.toFixed(3)
  const lng3 = lng.toFixed(3)
  return `${lat3}_${lng3}`
}

/**
 * Llama a Google Places (Nearby Search New) para una coordenada. Devuelve
 * los lugares SIN la distancia calculada todavía — eso se hace después,
 * por separado para cada persona que consulta, tanto si el resultado vino
 * fresco de Google como si vino del caché.
 */
async function buscarEnGoogle(lat, lng) {
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
  return lugares.map((lugar) => ({
    placeId: lugar.id,
    nombre: lugar.displayName?.text || 'Lugar sin nombre',
    direccion: lugar.formattedAddress || '',
    tipos: lugar.types || [],
    lat: lugar.location?.latitude,
    lng: lugar.location?.longitude,
  }))
}

/**
 * Busca lugares cercanos a una coordenada usando Google Places, reutilizando
 * (vía Firestore) la respuesta ya obtenida para la misma zona en los
 * últimos minutos, si existe. Devuelve una lista corta (máx 2) ordenada por
 * cercanía a la coordenada EXACTA de quien pregunta — la distancia siempre
 * se calcula al momento, nunca desde el caché, así que el radio de 120m
 * sigue exigiéndose igual de estricto para cada persona.
 */
export async function buscarLugaresCercanos(lat, lng) {
  const zonaId = idZonaCache(lat, lng)
  const refCache = doc(db, 'cachePlaces', zonaId)

  let lugaresBase = null
  try {
    const snap = await getDoc(refCache)
    if (snap.exists()) {
      const datos = snap.data()
      const actualizadoEnMs = datos.actualizadoEn?.toMillis ? datos.actualizadoEn.toMillis() : 0
      if (Date.now() - actualizadoEnMs < DURACION_CACHE_MS) {
        lugaresBase = datos.lugares || []
      }
    }
  } catch (err) {
    // Si falla la lectura del caché (permisos, red), no bloqueamos la
    // activación por eso — simplemente se consulta a Google directo.
    lugaresBase = null
  }

  if (!lugaresBase) {
    lugaresBase = await buscarEnGoogle(lat, lng)
    // No bloqueamos la respuesta al usuario si falla el guardado del caché.
    setDoc(refCache, { lugares: lugaresBase, actualizadoEn: serverTimestamp() }).catch(() => {})
  }

  return lugaresBase
    .map((lugar) => ({
      ...lugar,
      distanciaMetros: calcularDistanciaMetros(lat, lng, lugar.lat, lugar.lng),
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
