import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import {
  obtenerActivacionPropia,
  escucharPersonasEnElLugar,
  pausarParticipacion,
  cancelarPausa,
  personasVisibles,
  renovarActividad,
  desactivarParticipacion,
  INTERVALO_LATIDO_MS,
} from '../services/activation'
import { obtenerUsuario } from '../firebase/auth'
import {
  marcarMeInteresa,
  marcarMasTarde,
  calcularEdad,
  obtenerUidsYaConectados,
  obtenerUidsConMiInteres,
  obtenerPasesConFecha,
  COOLDOWN_MAS_TARDE_MS,
} from '../services/discover'
import { OPCIONES_INTERES } from '../data/intereses'
import useVigilanciaSalida from '../hooks/useVigilanciaSalida'
import FotoCarrusel from '../components/FotoCarrusel'
import { IconContacto, IconMasTarde, IconMeInteresa, IconPausa } from '../components/Icons'
import BottomNav from '../components/BottomNav'

const ETIQUETAS_PLAN = {
  trago: '🍸 Compartir un trago',
  conversar: '💬 Buena conversación',
  pasarlo_bien: '🎉 Pasarlo bien',
  bailar: '🕺 Bailar',
  amigos: '👥 Hacer amigos',
  sorprender: '✨ Dejarse sorprender',
}

const MAPA_INTERESES = Object.fromEntries(OPCIONES_INTERES.map((op) => [op.valor, op]))

// Traduce el género propio ('mujer'/'hombre') a la forma en que se guarda
// la preferencia ('mujeres'/'hombres'), para poder compararlos.
const GENERO_A_PREFERENCIA = { mujer: 'mujeres', hombre: 'hombres' }

// ¿Sigue vigente la pausa de esta persona en este momento?
function estaPausado(pausadoHasta, ahoraMs) {
  if (!pausadoHasta) return false
  const ms = typeof pausadoHasta.toMillis === 'function' ? pausadoHasta.toMillis() : pausadoHasta
  return ms > ahoraMs
}

// ¿La preferencia de alguien incluye el género de la otra persona?
function preferenciaIncluyeGenero(preferencia, genero) {
  if (preferencia === 'ambos') return true
  return GENERO_A_PREFERENCIA[genero] === preferencia
}

// Filtro MUTUO: solo se muestran si yo quiero ver su género Y ellos también
// querrían ver el mío.
function sonCompatiblesPorGenero(miGenero, miPreferencia, suGenero, suPreferencia) {
  const yoLoQuiero = preferenciaIncluyeGenero(miPreferencia || 'ambos', suGenero)
  const elMeQuiere = preferenciaIncluyeGenero(suPreferencia || 'ambos', miGenero)
  return yoLoQuiero && elMeQuiere
}

function formatearTiempoRestante(segundos) {
  const s = Math.max(0, segundos)
  const min = Math.floor(s / 60)
  const seg = s % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}

// Categoría de orden: 0 = nunca vista, 1 = "tal vez" (más tarde), 2 = ya le
// dio like (sin match). Nuevas primero, luego tal vez, al final las que ya
// le dio like.
function categoriaOrden(uid, misPases, misLikes) {
  if (misLikes.has(uid)) return 2
  if (misPases.has(uid)) return 1
  return 0
}

// Arma el link de WhatsApp con el mensaje ya escrito para el contacto de
// confianza: dónde está, a qué hora, y un link a la ubicación en el mapa.
// Usamos query_place_id (no solo lat/lng en bruto) porque Google Maps, con
// coordenadas solas, a veces "engancha" el pin al negocio más cercano en
// vez del lugar correcto — en una calle con locales pegados eso puede
// mandar a la persona equivocada de dirección.
function armarLinkAvisoWhatsApp(contacto, placeName, lat, lng, placeId) {
  const soloDigitos = (contacto.telefono || '').replace(/[^\d]/g, '')
  const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  let linkMapa = ''
  if (placeId && lat && lng) {
    linkMapa = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${placeId}`
  } else if (lat && lng) {
    linkMapa = `https://www.google.com/maps?q=${lat},${lng}`
  }
  const mensaje = `Hola ${contacto.nombre}! Te aviso que estoy en ${placeName || 'un lugar'} (${hora}) usando AquíMatch.${
    linkMapa ? ` Ubicación: ${linkMapa}` : ''
  }`
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(mensaje)}`
}

export default function Discover() {
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid

  const [cargando, setCargando] = useState(true)
  const [placeId, setPlaceId] = useState(null)
  const [miPlan, setMiPlan] = useState(null)
  const [miActivacion, setMiActivacion] = useState(null)
  const [contactoConfianza, setContactoConfianza] = useState(null)
  const [mostrarContacto, setMostrarContacto] = useState(false)
  const [personas, setPersonas] = useState([])
  const [perfilesCompletos, setPerfilesCompletos] = useState({})
  const [ocultos, setOcultos] = useState(() => new Set())
  const [misLikes, setMisLikes] = useState(() => new Set())
  const [misPases, setMisPases] = useState(() => new Map())
  const [indice, setIndice] = useState(0)
  const [procesando, setProcesando] = useState(false)
  const [animarCorazon, setAnimarCorazon] = useState(false)
  const [procesandoPausa, setProcesandoPausa] = useState(false)
  const [mostrarConfirmarPausa, setMostrarConfirmarPausa] = useState(false)
  const [error, setError] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())

  const estoyExplorando = miActivacion?.modo === 'explorar'

  // Igual que en Activación: si el GPS confirma que ya no estás cerca del
  // lugar, te desactivamos solo. Antes esto solo corría en la pantalla de
  // Activación — como la mayoría del tiempo activo se pasa acá, en
  // Descubrir, sin este hook alguien podía seguir "activo" mucho después
  // de irse de verdad, hasta que se cumpliera el umbral de inactividad.
  useVigilanciaSalida(
    miActivacion
      ? { placeId: miActivacion.placeId, lat: miActivacion.lat, lng: miActivacion.lng, tipos: miActivacion.tipos }
      : null,
    async () => {
      if (uid) await desactivarParticipacion(uid)
      navigate('/activacion', { state: { recienSalio: true } })
    }
  )

  useEffect(() => {
    let cancelado = false
    let detener = () => {}

    async function iniciar() {
      const activacion = await obtenerActivacionPropia(uid)
      if (!activacion || !activacion.activa) {
        navigate('/activacion')
        return
      }
      if (cancelado) return
      setPlaceId(activacion.placeId)
      setMiPlan(activacion.plan || null)
      setMiActivacion(activacion)

      const [yaConectados, misLikesLista, misPasesMapa] = await Promise.all([
        obtenerUidsYaConectados(uid),
        obtenerUidsConMiInteres(uid, activacion.placeId),
        obtenerPasesConFecha(uid, activacion.placeId),
      ])
      const miUsuario = await obtenerUsuario(uid)
      const bloqueados = miUsuario?.bloqueados || []
      const aExcluir = [...yaConectados, ...bloqueados]
      if (aExcluir.length > 0) {
        setOcultos((prev) => {
          const nuevo = new Set(prev)
          aExcluir.forEach((u) => nuevo.add(u))
          return nuevo
        })
      }
      if (cancelado) return
      setContactoConfianza(miUsuario?.contactoConfianza || null)
      setMisLikes(new Set(misLikesLista))
      setMisPases(misPasesMapa)

      detener = escucharPersonasEnElLugar(activacion.placeId, uid, (lista) => {
        setPersonas(lista)
        setCargando(false)
      })
    }

    iniciar()
    return () => {
      cancelado = true
      detener()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // Reloj interno: hace que la pausa se venza sola.
  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  // "Late" que seguimos presentes cada cierto tiempo mientras navegamos
  // Descubrir, para que nuestra propia activación nunca se trate como
  // "fantasma" por quedarse sin renovar.
  useEffect(() => {
    if (!uid) return
    const intervalo = setInterval(() => {
      renovarActividad(uid)
    }, INTERVALO_LATIDO_MS)
    return () => clearInterval(intervalo)
  }, [uid])

  // Orden: 1º personas nuevas, 2º "tal vez" (más tarde), 3º ya les diste
  // like. Dentro de cada grupo, se prioriza a quienes comparten tu plan.
  function ordenarPorPrioridad(lista, plan) {
    return [...lista].sort((a, b) => {
      const catA = categoriaOrden(a.uid, misPases, misLikes)
      const catB = categoriaOrden(b.uid, misPases, misLikes)
      if (catA !== catB) return catA - catB
      const aCoincide = plan && a.plan === plan ? 0 : 1
      const bCoincide = plan && b.plan === plan ? 0 : 1
      return aCoincide - bCoincide
    })
  }

  const disponibles = useMemo(() => {
    const miGenero = miActivacion?.genero
    const miPreferencia = miActivacion?.preferenciaGenero || 'ambos'
    const filtradas = personasVisibles(personas).filter((p) => {
      if (ocultos.has(p.uid)) return false
      if (estaPausado(p.pausadoHasta, ahora)) return false
      const pasadoEn = misPases.get(p.uid)
      if (pasadoEn && ahora - pasadoEn < COOLDOWN_MAS_TARDE_MS) return false
      return sonCompatiblesPorGenero(miGenero, miPreferencia, p.genero, p.preferenciaGenero)
    })
    return ordenarPorPrioridad(filtradas, miPlan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, ocultos, ahora, miActivacion, misLikes, misPases, miPlan])

  const actual = disponibles[indice] || null

  useEffect(() => {
    if (!actual || perfilesCompletos[actual.uid]) return
    obtenerUsuario(actual.uid).then((datos) => {
      if (datos) {
        setPerfilesCompletos((prev) => ({ ...prev, [actual.uid]: datos }))
      }
    })
  }, [actual, perfilesCompletos])

  async function manejarMeInteresa() {
    if (!actual || procesando || estoyExplorando) return
    setAnimarCorazon(true)
    setTimeout(() => setAnimarCorazon(false), 500)

    setProcesando(true)
    setError('')
    try {
      const resultado = await marcarMeInteresa(uid, actual.uid, placeId)
      setMisLikes((prev) => new Set(prev).add(actual.uid))
      if (resultado.mutuo) {
        navigate(`/conexion/${resultado.conexionId}`)
        return
      }
      setTimeout(() => avanzarQuitando(actual.uid), 350)
    } catch (err) {
      setError('No pudimos registrar tu interés. Intenta de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  async function manejarMasTarde() {
    if (!actual || procesando) return
    setProcesando(true)
    setError('')
    try {
      await marcarMasTarde(uid, actual.uid, placeId)
      setMisPases((prev) => new Map(prev).set(actual.uid, Date.now()))
      avanzarQuitando(actual.uid)
    } catch (err) {
      setError('No pudimos registrar tu elección. Intenta de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  function avanzarQuitando(uidPersona) {
    setOcultos((prev) => new Set(prev).add(uidPersona))
    setIndice(0)
  }

  async function manejarPausar() {
    if (procesandoPausa || estoyPausado || pausaYaUsada) return
    setProcesandoPausa(true)
    setError('')
    try {
      const pausadoHasta = await pausarParticipacion(uid)
      setMiActivacion((prev) => ({ ...(prev || {}), pausadoHasta, pausaUsada: true }))
      setMostrarConfirmarPausa(false)
    } catch (err) {
      setError('No pudimos activar la pausa. Intenta de nuevo.')
    } finally {
      setProcesandoPausa(false)
    }
  }

  async function manejarTerminarPausa() {
    if (procesandoPausa) return
    setProcesandoPausa(true)
    setError('')
    try {
      await cancelarPausa(uid)
      setMiActivacion((prev) => ({ ...(prev || {}), pausadoHasta: null }))
    } catch (err) {
      setError('No pudimos terminar la pausa. Intenta de nuevo.')
    } finally {
      setProcesandoPausa(false)
    }
  }

  function manejarAvisarContacto() {
    if (!contactoConfianza) return
    const url = armarLinkAvisoWhatsApp(
      contactoConfianza,
      miActivacion?.placeName,
      miActivacion?.lat,
      miActivacion?.lng,
      miActivacion?.placeId
    )
    window.open(url, '_blank', 'noopener,noreferrer')
    setMostrarContacto(false)
  }

  const pausadoHastaMs = miActivacion?.pausadoHasta
    ? typeof miActivacion.pausadoHasta.toMillis === 'function'
      ? miActivacion.pausadoHasta.toMillis()
      : miActivacion.pausadoHasta
    : null
  const estoyPausado = !!pausadoHastaMs && pausadoHastaMs > ahora
  const pausaYaUsada = miActivacion?.pausaUsada === true
  const segundosRestantes = estoyPausado ? Math.ceil((pausadoHastaMs - ahora) / 1000) : 0

  const interesesDeLaPersona = actual ? perfilesCompletos[actual.uid]?.intereses || [] : []

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <p>Buscando personas cerca de ti...</p>
      </div>
    )
  }

  return (
    <div className="screen screen-with-nav" style={{ padding: '20px 20px 0' }}>
      {/* Contador de personas + ícono discreto de seguridad */}
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <span className="pill-badge" style={{ padding: '6px 12px', fontSize: 12.5 }}>
          👥 {disponibles.length} persona{disponibles.length === 1 ? '' : 's'} por descubrir
        </span>
        {estoyExplorando && <span className="pill-badge" style={{ padding: '6px 12px', fontSize: 12.5 }}>👁️ Estás explorando</span>}
        {!estoyExplorando && (
          <button
            onClick={() => !estoyPausado && !pausaYaUsada && setMostrarConfirmarPausa(true)}
            aria-label={
              estoyPausado ? 'Estás en pausa' : pausaYaUsada ? 'Ya usaste tu pausa esta visita' : 'Pausar mi participación'
            }
            style={{
              position: 'relative',
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: estoyPausado ? 'rgba(255,45,142,0.14)' : 'var(--bg-card)',
              border: `1px solid ${estoyPausado ? 'var(--magenta)' : 'var(--border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: estoyPausado || pausaYaUsada ? 'default' : 'pointer',
              color: estoyPausado ? 'var(--magenta)' : 'var(--text-dim)',
              opacity: pausaYaUsada && !estoyPausado ? 0.45 : 1,
            }}
          >
            <IconPausa size={16} />
            {pausaYaUsada && !estoyPausado && (
              <span
                style={{
                  position: 'absolute',
                  bottom: -3,
                  right: -3,
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-faint)',
                }}
              >
                <IconMasTarde size={9} />
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => setMostrarContacto(true)}
          aria-label="Contacto de confianza"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            color: 'var(--text-dim)',
          }}
        >
          <IconContacto size={17} />
        </button>
      </div>

      {estoyPausado && (
        <div
          className="chip"
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '10px 12px', cursor: 'default', flex: '0 0 auto' }}
        >
          <IconPausa size={18} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>Estás en pausa</div>
            <div style={{ fontSize: 11 }}>
              Los demás no te ven durante {formatearTiempoRestante(segundosRestantes)} más
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ width: 'auto', padding: '6px 10px', fontSize: 11.5 }}
            onClick={manejarTerminarPausa}
            disabled={procesandoPausa}
          >
            {procesandoPausa ? '...' : 'Terminar'}
          </button>
        </div>
      )}

      {!actual ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>👀</div>
          <h1 style={{ marginBottom: 10 }}>Por ahora es todo</h1>
          <p style={{ marginBottom: 24 }}>
            Ya viste a todas las personas activas en este lugar. Vuelve a intentarlo en un rato.
          </p>
        </div>
      ) : (
        <>
          <div className="card-stack" style={{ flex: '0 0 auto' }}>
            <div
              style={{
                width: '100%',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-card)',
              }}
            >
            <FotoCarrusel
              key={actual.uid}
              fotos={[actual.fotoPrincipal, ...(perfilesCompletos[actual.uid]?.fotosAdicionales || [])]}
              alto="clamp(380px, 62vh, 620px)"
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '22px 16px 14px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.15) 60%, transparent)',
                  zIndex: 1,
                }}
              >
                <h2 style={{ color: 'white', fontSize: 22, marginBottom: 3 }}>
                  {actual.nombre}
                  {perfilesCompletos[actual.uid]
                    ? `, ${calcularEdad(perfilesCompletos[actual.uid].fechaNacimiento)}`
                    : ''}
                </h2>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginBottom: 8 }}>
                  📍 En este lugar
                </div>
                {actual.plan && (
                  <span className="tag-pill" style={{ marginRight: 6 }}>
                    {ETIQUETAS_PLAN[actual.plan] || actual.plan}
                  </span>
                )}
                {interesesDeLaPersona.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {interesesDeLaPersona.map((valor) => {
                      const op = MAPA_INTERESES[valor]
                      if (!op) return null
                      return (
                        <span
                          key={valor}
                          style={{
                            padding: '5px 11px',
                            borderRadius: 16,
                            background: 'rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.9)',
                            fontSize: 11,
                          }}
                        >
                          {op.emoji} {op.etiqueta}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </FotoCarrusel>
            </div>
          </div>

          <div style={{ height: 24 }} />

          {error && (
            <p className="error-text" style={{ textAlign: 'center', marginTop: 8 }}>
              {error}
            </p>
          )}

          {estoyExplorando ? (
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-secondary" onClick={() => avanzarQuitando(actual.uid)}>
                Ver a la siguiente persona
              </button>
              <p className="legal-note" style={{ marginTop: 10 }}>
                Estás explorando: puedes mirar, pero no enviar interés. Sal y vuelve a entrar al
                lugar si quieres pasar a modo Participar.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 26, marginTop: 12, marginBottom: 8, justifyContent: 'center', flex: '0 0 auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button
                  className="btn-circle btn-circle-secondary"
                  onClick={manejarMasTarde}
                  disabled={procesando}
                  aria-label="Más tarde"
                  style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <IconMasTarde size={20} />
                </button>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)' }}>Más tarde</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button
                  className={`btn-circle btn-circle-primary${animarCorazon ? ' animando' : ''}`}
                  onClick={manejarMeInteresa}
                  disabled={procesando}
                  aria-label="Me interesa"
                  style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <IconMeInteresa size={21} style={{ color: 'white' }} />
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>Me interesa</span>
              </div>
            </div>
          )}
        </>
      )}

      <BottomNav />

      {/* Confirmación antes de pausar — se abre al tocar el ícono de pausa */}
      {mostrarConfirmarPausa && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 300,
              background: 'rgba(18,0,34,0.97)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 22,
              textAlign: 'center',
            }}
          >
            <IconPausa size={26} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
            <h2 style={{ fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>¿Pausar tu participación?</h2>
            <p style={{ fontSize: 12.5, marginBottom: 18, lineHeight: 1.6 }}>
              Quedás invisible para los demás durante 20 minutos. Solo podés usar esto una vez por
              visita al lugar.
            </p>
            {error && (
              <p className="error-text" style={{ marginBottom: 10 }}>
                {error}
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ marginBottom: 10 }}
              onClick={manejarPausar}
              disabled={procesandoPausa}
            >
              {procesandoPausa ? 'Pausando...' : 'Pausar 20 minutos'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '9px 0', fontSize: 12.5 }}
              onClick={() => setMostrarConfirmarPausa(false)}
              disabled={procesandoPausa}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Ventanita del contacto de confianza — oculto hasta que se toca el ícono */}
      {mostrarContacto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
          onClick={() => setMostrarContacto(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 300,
              background: 'rgba(18,0,34,0.97)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contactoConfianza ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <IconContacto size={22} style={{ color: 'var(--text)' }} />
                  <div>
                    <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                      {contactoConfianza.nombre}
                    </div>
                    <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>{contactoConfianza.telefono}</div>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ padding: '10px 0', fontSize: 13 }} onClick={manejarAvisarContacto}>
                  Avisar por WhatsApp
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
                  Agrega un contacto en tu perfil para poder avisarle dónde estás en un toque.
                </p>
                <button className="btn btn-primary" style={{ padding: '10px 0', fontSize: 13 }} onClick={() => navigate('/perfil')}>
                  Ir a mi perfil
                </button>
              </>
            )}
            <button
              className="btn btn-ghost"
              style={{ marginTop: 10, padding: '8px 0', fontSize: 12.5 }}
              onClick={() => setMostrarContacto(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
