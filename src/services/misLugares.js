// Los lugares donde ya estuviste, para poder volver a entrar en dos toques.
//
// ESTO NO SUBE A NINGÚN SERVIDOR, Y ES A PROPÓSITO. La lista dice a qué bares
// sales y con qué frecuencia — el dato más delicado que produce esta app.
// Decidimos no guardarlo ni siquiera para el panel de los dueños, donde solo
// contamos cuántas personas hubo y nunca quiénes. Guardarlo en nuestra base
// para una comodidad sería contradecir eso por una razón mucho peor.
//
// Vive en el almacenamiento del navegador dentro de la app. Si alguien cambia
// de teléfono o reinstala, se pierde y se vuelve a armar sola en dos salidas.
// Es una comodidad, no un dato que haya que respaldar.
//
// Lo que sí vive en el servidor es la ficha del local (nombre y coordenadas),
// compartida entre todos: eso es información de un bar, no de una persona. Y
// tiene que estar ahí porque el servidor no puede creerle al teléfono cuando
// comprueba que estás realmente a menos de 120 metros.

const CLAVE = 'aquimatch.misLugares'

// Cuántos se recuerdan. Más que esto no aporta: la lista se muestra filtrada
// por cercanía, así que los de otro barrio nunca aparecen igual.
const MAXIMO = 8

function leerTodos() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return []
    const lista = JSON.parse(crudo)
    return Array.isArray(lista) ? lista : []
  } catch (err) {
    // Almacenamiento lleno, deshabilitado o con contenido corrupto: se trata
    // como si no hubiera nada. Nunca puede tumbar la pantalla de activación.
    return []
  }
}

function guardarTodos(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)))
  } catch (err) {
    // Si no se puede guardar, la persona simplemente no tendrá el atajo.
  }
}

/**
 * Recuerda un lugar donde la persona acaba de activarse. Si ya estaba, sube al
 * principio (los más recientes primero) en vez de duplicarse.
 */
export function recordarLugar({ placeId, nombre, lat, lng }) {
  if (!placeId || typeof lat !== 'number' || typeof lng !== 'number') return
  const otros = leerTodos().filter((l) => l.placeId !== placeId)
  guardarTodos([{ placeId, nombre: nombre || '', lat, lng }, ...otros])
}

/**
 * Los lugares recordados que están al alcance de estas coordenadas, del más
 * cercano al más lejano.
 *
 * El radio que se pasa acá tiene que ser el mismo con el que el servidor
 * autoriza la activación. Si fuera mayor, la app ofrecería un atajo que el
 * servidor va a rechazar, y la persona se llevaría un "estás demasiado lejos"
 * después de tocar un botón que la app le puso adelante.
 */
export function lugaresCercaDe(lat, lng, radioMetros, calcularDistancia) {
  return leerTodos()
    .map((l) => ({ ...l, distanciaMetros: calcularDistancia(lat, lng, l.lat, l.lng) }))
    .filter((l) => l.distanciaMetros <= radioMetros)
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
}

/** Se usa al borrar la cuenta: no tiene sentido dejar esto en el teléfono. */
export function olvidarLugares() {
  try {
    localStorage.removeItem(CLAVE)
  } catch (err) {
    // Nada que hacer.
  }
}
