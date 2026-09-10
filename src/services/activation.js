import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase/config'
import { registrarEvento } from '../firebase/analytics'

// Radio máximo antes de considerar que el usuario ya se fue del lugar.
// Los lugares grandes (universidades, estadios) necesitan un radio mayor
// que un bar chico, para no marcar como "se fue" a alguien que solo
// caminó de un edificio a otro dentro del mismo campus/recinto.
export const RADIO_SALIDA_METROS = 200
export const RADIO_SALIDA_LUGAR_GRANDE_METROS = 800
export const RADIO_SALIDA_ESTADIO_METROS = 500

export function radioSalidaSegunTipos(tipos = []) {
  if (tipos.includes('university')) return RADIO_SALIDA_LUGAR_GRANDE_METROS
  if (tipos.includes('stadium')) return RADIO_SALIDA_ESTADIO_METROS
  return RADIO_SALIDA_METROS
}
// Duración de la pausa "No por ahora" (DEC-006): 20 minutos, una vez por sesión de participación.
export const DURACION_PAUSA_MS = 20 * 60 * 1000

// Si una activación no se "renueva" en este tiempo, se trata como si esa
// persona ya no estuviera presente, aunque su campo activa siga en true
// (por ejemplo, si cerró la app sin tocar "Salir de este lugar" y el GPS
// nunca detectó que se alejó). Esto evita "personas fantasma" contándose
// como presentes días después de haberse ido. 3 horas para cubrir una
// noche entera sin exigir que la persona tenga la app abierta todo el
// tiempo (antes eran 20 min, muy poco para alguien que guarda el celular
// mientras está en el lugar).
//
// OJO: este número está duplicado en functions/index.js, porque el panel del
// dueño cuenta la gente presente con la misma regla. Si se cambia acá, hay que
// cambiarlo allá o los dos lados mostrarán cantidades distintas.
export const UMBRAL_INACTIVIDAD_MS = 3 * 60 * 60 * 1000

// Cada cuánto se debe "avisar" que uno sigue aquí, mientras está en las
// pantallas de Estado o Descubrir. Tiene que ser bastante menor al umbral
// de inactividad de arriba, para que nunca se pase de la raya por error.
//
// SUBIDO DE 5 A 20 MINUTOS EL 2026-09-05. Cinco minutos era 36 veces más
// seguido de lo necesario para un umbral de 3 horas, y el costo de eso no es
// lineal: cuando late una persona, su documento cambia, y TODOS los que están
// en ese mismo lugar lo están escuchando — así que cada latido se cobra como
// una lectura por cada persona presente. El gasto crece con el cuadrado de la
// gente que hay en el local:
//
//   10 personas →  ~1.000 lecturas/hora
//   20 personas →  ~4.500 lecturas/hora
//   50 personas → ~29.000 lecturas/hora
//
// Con 50.000 lecturas gratis por día, una sola noche buena en tres locales se
// comía el día entero. A 20 minutos eso baja a la cuarta parte, y sigue
// dejando 9 latidos de margen antes de las 3 horas.
//
// No es solo plata: son escrituras y datos móviles del teléfono de la persona,
// en un bar donde la señal suele ser mala.
export const INTERVALO_LATIDO_MS = 20 * 60 * 1000

// A partir de esta edad de la activación, el latido deja de ser solo un latido:
// además de decir "sigo acá", vuelve a comprobar por GPS que es verdad, y con
// eso renueva el permiso de lectura.
//
// El número está atado a la ventana de seis horas de firestore.rules (la regla
// de lectura de /activaciones exige que `iniciadaEn` tenga menos de 6 horas).
// A las 4 horas quedan 2 de margen, o sea 6 latidos: si uno falla porque el bar
// no tiene señal, hay cinco intentos más antes de la pared. Si se cambia el 6
// de las reglas, hay que mover este número también, y siempre con margen para
// varios reintentos — no al ras.
export const EDAD_PARA_RENOVAR_MS = 4 * 60 * 60 * 1000

/**
 * Activa la participación del usuario en un lugar.
 * Usamos el uid como ID del documento: una activación activa por usuario.
 * modo empieza en null; se define justo después, en la pantalla de
 * "¿Cómo quieres entrar?" (Participar / Explorar).
 */
export async function activarEnLugar(uid, lugar, coords) {
  // Ya no se escribe el documento desde acá. Lo hace una Cloud Function, que
  // antes le pregunta a Google Places si el lugar elegido está realmente a
  // menos de 120 metros de las coordenadas que manda el teléfono. Si la
  // verificación se hiciera solo en la app, cualquiera con conocimientos
  // técnicos podría declararse en cualquier bar de Chile y ver a toda la gente
  // activa ahí sin estar presente — justo lo que la app promete que no pasa.
  //
  // El nombre, la foto y el género tampoco se mandan: el servidor los lee del
  // perfil guardado, para que nadie pueda activarse haciéndose pasar por otra
  // persona.
  const llamar = httpsCallable(functions, 'activarEnLugar')
  const { data } = await llamar({
    lat: coords.lat,
    lng: coords.lng,
    placeId: lugar.placeId,
  })
  registrarEvento('activacion_iniciada', {
    place_id: data.placeId,
    place_name: data.placeName,
  })
  return data
}

/**
 * Desactiva la participación (salida manual o automática por GPS).
 */
export async function desactivarParticipacion(uid) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    activa: false,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * "Late" que la persona sigue presente, renovando actualizadaEn sin
 * cambiar nada más. Se llama periódicamente mientras el usuario está en
 * las pantallas de Estado o Descubrir, para que nunca se le trate como
 * "persona fantasma" por error mientras sigue realmente ahí.
 */
export async function renovarActividad(uid) {
  // Con la app en segundo plano no se late. El latido dice "sigo acá", y
  // mandarlo con el teléfono guardado gasta batería y datos de la persona,
  // además de una lectura por cada uno de los que están en el mismo local.
  //
  // No hace falta compensarlo al volver: el umbral es de 3 horas, así que
  // guardar el teléfono un rato largo no te saca del lugar. Y si de verdad
  // pasaron 3 horas, que te saque es lo correcto.
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

  const ref = doc(db, 'activaciones', uid)
  try {
    await updateDoc(ref, { actualizadaEn: serverTimestamp() })
  } catch (err) {
    // Si falla (por ejemplo, la activación ya no existe), no hacemos nada
    // más — no vale la pena interrumpir al usuario por esto.
    return
  }
  await renovarPresenciaSiHaceFalta(uid)
}

/**
 * La segunda mitad del latido: cada tanto no basta con avisar que seguimos
 * acá, hay que DEMOSTRARLO.
 *
 * La regla de lectura de /activaciones caduca a las seis horas de `iniciadaEn`,
 * que la escribe el servidor. Sin esto, alguien que llegó al bar a las nueve
 * dejaba de ver a la gente del bar a las tres de la mañana, estando sentado
 * ahí. No fallaba con un mensaje: la consulta empezaba a rebotar y Descubrir se
 * quedaba en blanco, que es la peor forma de romperse.
 *
 * Se lee el documento propio en cada latido (uno cada 20 minutos) para saber la
 * edad de la activación. Se podría guardar en memoria y ahorrarse la lectura,
 * pero se perdería al reiniciar la app — y entonces quien cierra y abre la app
 * durante la noche nunca renovaría, que es justo el caso que hay que cubrir.
 * Una lectura del propio documento cada 20 minutos no se compara con lo que ya
 * cuesta el latido en sí: cuando uno late, TODOS los del local lo leen.
 */
export async function renovarPresenciaSiHaceFalta(uid, { forzar = false } = {}) {
  const ref = doc(db, 'activaciones', uid)
  try {
    if (!forzar) {
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(ref)
      const activacion = snap.data()
      if (!activacion?.activa || !activacion.iniciadaEn) return false
      const edad = Date.now() - activacion.iniciadaEn.toMillis()
      if (edad < EDAD_PARA_RENOVAR_MS) return false
    }

    const { obtenerPosicion } = await import('./ubicacion')
    const { lat, lng } = await obtenerPosicion()
    const llamar = httpsCallable(functions, 'renovarPresencia')
    await llamar({ lat, lng })
    return true
  } catch (err) {
    // Si la renovación falla no se interrumpe a nadie ni se le apaga la
    // activación desde acá. Puede ser que el GPS no responda dentro del bar, o
    // que no haya señal — y sacar a alguien del lugar por eso sería peor que el
    // problema. Quedan varios latidos más antes de que se cierre la ventana, y
    // si de verdad se fue, de eso se encarga la vigilancia por GPS. Si la
    // cuenta dejó de ser apta, el servidor ya apagó la activación por su lado.
    return false
  }
}

/**
 * Guarda el modo elegido: 'participar' (visible, puede conectar) o
 * 'explorar' (invisible para los demás, solo puede mirar). Se elige una
 * vez por visita, justo después de confirmar el lugar.
 */
export async function actualizarModo(uid, modo) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    modo,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Actualiza la preferencia de género en la activación en curso, cuando la
 * persona la cambia desde Perfil mientras ya está activa en un lugar — si
 * no se actualizara acá también, el cambio no tendría efecto hasta la
 * próxima vez que se active (el filtro de compatibilidad en Descubrir lee
 * este campo desde la activación, no desde el perfil).
 */
export async function actualizarPreferenciaGeneroActivacion(uid, preferenciaGenero) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    preferenciaGenero,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Guarda o actualiza el "Plan de la noche" del usuario mientras participa.
 */
export async function actualizarPlan(uid, plan) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    plan,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Activa la pausa "No por ahora" (DEC-006): dura 20 minutos y solo puede
 * usarse una vez por sesión de participación.
 */
export async function pausarParticipacion(uid) {
  const ref = doc(db, 'activaciones', uid)
  const pausadoHasta = Timestamp.fromMillis(Date.now() + DURACION_PAUSA_MS)
  await updateDoc(ref, {
    pausadoHasta,
    pausaUsada: true,
    actualizadaEn: serverTimestamp(),
  })
  return pausadoHasta
}

/**
 * Termina la pausa antes de que se cumplan los 20 minutos. No devuelve el
 * "una vez por visita" — pausaUsada se queda en true, para que no sirva
 * como forma de pausar y despausar repetidas veces.
 */
export async function cancelarPausa(uid) {
  const ref = doc(db, 'activaciones', uid)
  await updateDoc(ref, {
    pausadoHasta: null,
    actualizadaEn: serverTimestamp(),
  })
}

/**
 * Obtiene la activación actual del usuario (para saber en qué lugar está).
 */
export async function obtenerActivacionPropia(uid) {
  const { getDoc, updateDoc } = await import('firebase/firestore')
  const ref = doc(db, 'activaciones', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const activacion = snap.data()

  // La MISMA regla de frescura que se les aplica a los demás tiene que
  // aplicarse a uno mismo. Antes acá solo se miraba `activa`, y como nada
  // apaga esa bandera si cerrás la app sin tocar "salir de este lugar" (la
  // vigilancia por GPS solo corre con la app abierta), abrirla días después
  // te depositaba en el bar de la última vez.
  //
  // Y lo peor era la asimetría: los demás SÍ te filtraban por frescura
  // (esRecienteYActiva, en escucharPersonasEnElLugar), así que quedabas en
  // estado fantasma — pasando perfiles convencido de que participabas, y
  // sin que te viera nadie.
  if (!esRecienteYActiva(activacion, Date.now())) {
    // Se apaga la bandera para que el estado deje de mentir. Si falla —sin
    // red, por ejemplo— no importa: igual devolvemos null y la app manda a
    // elegir lugar.
    if (activacion.activa) await updateDoc(ref, { activa: false }).catch(() => {})
    return null
  }
  return activacion
}

// ¿Esta activación se "renovó" hace poco, o ya se puede considerar
// abandonada/fantasma aunque diga activa: true?
export function esRecienteYActiva(persona, ahoraMs) {
  if (!persona.activa) return false
  const referencia = persona.actualizadaEn || persona.iniciadaEn
  if (!referencia) return false
  const refMs = referencia.toMillis ? referencia.toMillis() : referencia
  return ahoraMs - refMs <= UMBRAL_INACTIVIDAD_MS
}

/**
 * Escucha en tiempo real cuántas personas activas hay en el mismo lugar.
 * callback recibe la lista de activaciones activas Y con actividad
 * reciente (sin contar al propio usuario) — las que quedaron "pegadas"
 * en activa: true por días sin renovarse se excluyen automáticamente.
 *
 * QUIEN ELIGIÓ "EXPLORAR" YA NO VIENE EN LA RESPUESTA. Antes sí venía —con su
 * uid, su nombre y su foto— y se escondía después con personasVisibles(). Eso
 * significa que "puedes mirar sin aparecer" era cierto solo para quien usara
 * nuestra app: cualquiera con un cliente propio los veía igual. Prometemos
 * invisibilidad; esconderlos en la pantalla no es invisibilidad.
 *
 * Por eso el filtro por `modo` va en la consulta. No es una optimización: es
 * lo que permite que la REGLA del servidor pueda exigirlo. Las reglas de
 * Firestore no filtran, exigen — si la consulta pide documentos que la regla
 * no permite, falla entera. Así que la consulta tiene que pedir exactamente lo
 * que la regla va a dejar pasar.
 *
 * OJO CON EL ORDEN AL DESPLEGAR: esta consulta sale primero, en la app, y la
 * regla se aprieta DESPUÉS, cuando la gente ya haya actualizado. Al revés, a
 * todo el que siga en una versión vieja se le queda Descubrir en blanco.
 */
export function escucharPersonasEnElLugar(placeId, uidPropio, callback, alFallar) {
  const ref = collection(db, 'activaciones')
  const q = query(
    ref,
    where('placeId', '==', placeId),
    where('activa', '==', true),
    where('modo', '==', 'participar')
  )

  // Una suscripción de Firestore que se cae NO se levanta sola, y hasta ahora
  // esta ni siquiera tenía a quién avisarle: onSnapshot iba sin segundo
  // argumento, así que un rechazo de las reglas se perdía en silencio.
  // Descubrir se quedaba con el spinner girando para siempre —nunca llegaba el
  // primer resultado, que es lo único que apagaba "cargando"— y desde afuera
  // parecía que el bar estaba vacío y con mala señal.
  //
  // Cuándo pasa: la ventana de seis horas se cerró antes de que alcanzara a
  // renovarse (varios latidos seguidos sin GPS, o la app cerrada durante la
  // parte de la noche en que tocaba renovar). Renovar después no bastaba: la
  // suscripción ya estaba muerta.
  //
  // Por eso el rescate: se renueva a la fuerza y se vuelve a suscribir. Una
  // sola vez. Si el segundo intento también falla, se avisa y no se insiste —
  // reintentar en bucle contra una regla que dice que no es una forma cara de
  // no arreglar nada.
  let detener = () => {}
  let cancelado = false
  let yaSeIntentoRescatar = false

  function suscribir() {
    detener = onSnapshot(
      q,
      (snapshot) => {
        const ahora = Date.now()
        const personas = snapshot.docs
          .map((d) => d.data())
          .filter((persona) => persona.uid !== uidPropio)
          .filter((persona) => esRecienteYActiva(persona, ahora))
        callback(personas)
      },
      async (error) => {
        if (cancelado || yaSeIntentoRescatar) {
          if (!cancelado) alFallar?.(error)
          return
        }
        yaSeIntentoRescatar = true
        const renovada = await renovarPresenciaSiHaceFalta(uidPropio, { forzar: true })
        if (cancelado) return
        if (renovada) suscribir()
        else alFallar?.(error)
      }
    )
  }

  suscribir()
  return () => {
    cancelado = true
    detener()
  }
}

/**
 * Filtra quiénes deben verse en el descubrimiento y en el conteo de
 * "personas participando": nunca quienes eligieron modo 'explorar'.
 *
 * Desde el 2026-09-09 la consulta ya no los trae, así que esto no debería
 * quitar a nadie. Se deja igual, por dos motivos: las activaciones creadas
 * antes de este cambio pueden tener `modo: null` y quedar fuera de la consulta
 * pero seguir apareciendo por otro camino, y porque una segunda barrera barata
 * en el único lugar donde se decide quién se ve vale lo que cuesta.
 */
export function personasVisibles(lista) {
  return lista.filter((p) => p.modo !== 'explorar')
}
