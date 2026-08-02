import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { obtenerUsuario } from '../firebase/auth'
import { buscarLugaresCercanos } from '../services/places'
import {
  activarEnLugar,
  actualizarModo,
  actualizarPlan,
  desactivarParticipacion,
  escucharPersonasEnElLugar,
  obtenerActivacionPropia,
  personasVisibles,
  renovarActividad,
  INTERVALO_LATIDO_MS,
} from '../services/activation'
import useVigilanciaSalida from '../hooks/useVigilanciaSalida'
import BottomNav from '../components/BottomNav'

// Estados posibles de esta pantalla dinámica
const ESTADOS = {
  PIDIENDO_UBICACION: 'pidiendo_ubicacion',
  BUSCANDO_LUGAR: 'buscando_lugar',
  ELEGIR_LUGAR: 'elegir_lugar',
  SIN_LUGARES: 'sin_lugares',
  ACTIVANDO: 'activando',
  ELEGIR_MODO: 'elegir_modo',
  ELEGIR_PLAN: 'elegir_plan',
  PARTICIPANDO: 'participando',
  NO_PARTICIPANDO: 'no_participando',
  ERROR: 'error',
}

const OPCIONES_PLAN = [
  { valor: 'trago', etiqueta: 'Compartir un trago', emoji: '🍸' },
  { valor: 'conversar', etiqueta: 'Tener una buena conversación', emoji: '💬' },
  { valor: 'pasarlo_bien', etiqueta: 'Pasarlo bien', emoji: '🎉' },
  { valor: 'bailar', etiqueta: 'Bailar', emoji: '🕺' },
  { valor: 'amigos', etiqueta: 'Hacer nuevos amigos', emoji: '👥' },
  { valor: 'sorprender', etiqueta: 'Dejarme sorprender', emoji: '✨' },
]

export default function Activation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [estado, setEstado] = useState(ESTADOS.PIDIENDO_UBICACION)
  const [lugares, setLugares] = useState([])
  const [lugarActivo, setLugarActivo] = useState(null)
  const [personasActivas, setPersonasActivas] = useState([])
  const [modoSeleccionado, setModoSeleccionado] = useState('participar')
  const [guardandoModo, setGuardandoModo] = useState(false)
  const [planSeleccionado, setPlanSeleccionado] = useState(null)
  const [mensajeError, setMensajeError] = useState('')

  const uid = getAuth().currentUser?.uid

  useVigilanciaSalida(lugarActivo, salirDelLugar)

  useEffect(() => {
    verificarEstadoInicial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Late" que seguimos presentes cada cierto tiempo, mientras haya un
  // lugar activo y esta pantalla esté abierta — así esta activación nunca
  // se trata como "fantasma" por quedarse sin renovar.
  useEffect(() => {
    if (!lugarActivo || !uid) return
    const intervalo = setInterval(() => {
      renovarActividad(uid)
    }, INTERVALO_LATIDO_MS)
    return () => clearInterval(intervalo)
  }, [lugarActivo, uid])

  // Al entrar a esta pantalla, primero revisa si el usuario YA está
  // participando activamente en un lugar. Si es así, muestra directo la
  // pantalla de bienvenida en vez de lanzar una búsqueda de lugares desde
  // cero — la búsqueda solo se dispara si la persona lo pide explícitamente
  // (tocando "Salir de este lugar" y luego "Buscar lugar de nuevo").
  async function verificarEstadoInicial() {
    // Si llegamos acá porque Descubrir detectó que ya nos habíamos ido del
    // lugar (ver useVigilanciaSalida), mostramos la pantalla neutral en
    // vez de salir a buscar un lugar nuevo solos — la búsqueda la dispara
    // la persona, no la app.
    if (location.state?.recienSalio) {
      setEstado(ESTADOS.NO_PARTICIPANDO)
      return
    }
    try {
      const activacion = await obtenerActivacionPropia(uid)
      if (activacion?.activa) {
        const lugar = {
          placeId: activacion.placeId,
          nombre: activacion.placeName,
          lat: activacion.lat,
          lng: activacion.lng,
          tipos: activacion.tipos,
        }
        setLugarActivo(lugar)
        escucharPersonasEnElLugar(lugar.placeId, uid, setPersonasActivas)

        if (!activacion.modo) {
          setModoSeleccionado('participar')
          setEstado(ESTADOS.ELEGIR_MODO)
        } else if (!activacion.plan) {
          setModoSeleccionado(activacion.modo)
          setEstado(ESTADOS.ELEGIR_PLAN)
        } else {
          setModoSeleccionado(activacion.modo)
          setEstado(ESTADOS.PARTICIPANDO)
        }
        return
      }
    } catch (err) {
      // Si falla la consulta, seguimos con el flujo normal de búsqueda.
    }
    solicitarUbicacionYBuscar()
  }

  async function solicitarUbicacionYBuscar() {
    setEstado(ESTADOS.PIDIENDO_UBICACION)

    if (!navigator.geolocation) {
      setMensajeError('Tu navegador no soporta geolocalización.')
      setEstado(ESTADOS.ERROR)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (posicion) => {
        setEstado(ESTADOS.BUSCANDO_LUGAR)
        const { latitude, longitude } = posicion.coords
        try {
          const encontrados = await buscarLugaresCercanos(latitude, longitude)
          if (encontrados.length === 0) {
            setEstado(ESTADOS.SIN_LUGARES)
          } else {
            setLugares(encontrados)
            setEstado(ESTADOS.ELEGIR_LUGAR)
          }
        } catch (err) {
          setMensajeError(err.message)
          setEstado(ESTADOS.ERROR)
        }
      },
      () => {
        setMensajeError(
          'No pudimos acceder a tu ubicación. Actívala en los permisos del navegador e intenta de nuevo.'
        )
        setEstado(ESTADOS.ERROR)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  async function confirmarLugar(lugar) {
    setEstado(ESTADOS.ACTIVANDO)
    try {
      const datosUsuario = await obtenerUsuario(uid)
      await activarEnLugar(uid, datosUsuario || {}, lugar)
      setLugarActivo(lugar)
      escucharPersonasEnElLugar(lugar.placeId, uid, setPersonasActivas)
      setModoSeleccionado('participar')
      setEstado(ESTADOS.ELEGIR_MODO)
    } catch (err) {
      setMensajeError('No pudimos activar tu participación. Intenta nuevamente.')
      setEstado(ESTADOS.ERROR)
    }
  }

  async function confirmarModo() {
    setGuardandoModo(true)
    try {
      await actualizarModo(uid, modoSeleccionado)
    } catch (err) {
      // No bloqueamos al usuario si esto falla; puede cambiarlo después saliendo y volviendo a entrar.
    } finally {
      setGuardandoModo(false)
    }
    setEstado(ESTADOS.ELEGIR_PLAN)
  }

  async function confirmarPlan(plan) {
    setPlanSeleccionado(plan)
    try {
      await actualizarPlan(uid, plan)
    } catch (err) {
      // No bloqueamos al usuario si esto falla; puede cambiar el plan después.
    }
    setEstado(ESTADOS.PARTICIPANDO)
  }

  // Al salir, solo desactivamos y mostramos una pantalla neutral. Ya NO se
  // vuelve a buscar lugares automáticamente — el usuario decide cuándo
  // quiere buscar de nuevo tocando el botón.
  async function salirDelLugar() {
    if (uid) await desactivarParticipacion(uid)
    setLugarActivo(null)
    setPersonasActivas([])
    setEstado(ESTADOS.NO_PARTICIPANDO)
  }

  // ---------- Vistas por estado ----------

  if (estado === ESTADOS.PIDIENDO_UBICACION) {
    return (
      <EstadoIntermedio
        emoji="📍"
        titulo="Para empezar, necesitamos tu ubicación."
        texto="Tu ubicación siempre estará protegida."
      />
    )
  }

  if (estado === ESTADOS.BUSCANDO_LUGAR) {
    return (
      <EstadoIntermedio
        emoji="🔎"
        titulo="Buscando lugares cerca de ti..."
        texto="Esto puede tardar unos segundos."
      />
    )
  }

  if (estado === ESTADOS.SIN_LUGARES) {
    return (
      <div className="screen screen-with-nav" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🤔</div>
        <h1 style={{ marginBottom: 10 }}>No encontramos un lugar aquí</h1>
        <p style={{ marginBottom: 24 }}>
          Asegúrate de estar dentro de un bar, café, restaurante o pub para activar tu
          participación.
        </p>
        <button className="btn btn-primary" onClick={solicitarUbicacionYBuscar}>
          Intentar de nuevo
        </button>
        <BottomNav />
      </div>
    )
  }

  if (estado === ESTADOS.ELEGIR_LUGAR) {
    return (
      <div className="screen screen-with-nav">
        <h1 style={{ marginBottom: 6 }}>¿Dónde estás?</h1>
        <p style={{ marginBottom: 20 }}>Elige el lugar en el que te encuentras ahora.</p>
        <div className="stack">
          {lugares.map((lugar) => (
            <div
              key={lugar.placeId}
              className="chip"
              style={{ textAlign: 'left', padding: '16px 18px', cursor: 'pointer' }}
              onClick={() => confirmarLugar(lugar)}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                {lugar.nombre}
              </div>
              <div style={{ fontSize: 13 }}>
                {lugar.direccion} · {Math.round(lugar.distanciaMetros)} m
              </div>
            </div>
          ))}
        </div>
        <p className="legal-note" style={{ marginTop: 20 }}>
          ¿No encuentras tu lugar? Vuelve a intentarlo estando más cerca de la entrada.
        </p>
        <BottomNav />
      </div>
    )
  }

  if (estado === ESTADOS.ACTIVANDO) {
    return (
      <EstadoIntermedio emoji="🛡️" titulo="Verificando tu presencia..." texto="Un momento por favor." />
    )
  }

  if (estado === ESTADOS.ELEGIR_MODO) {
    return (
      <div className="screen screen-with-nav">
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <p style={{ fontSize: 13, marginBottom: 4 }}>{lugarActivo?.nombre}</p>
          <h1 style={{ marginBottom: 6 }}>¿Cómo quieres entrar?</h1>
        </div>
        <p style={{ textAlign: 'center', marginBottom: 24 }}>
          Puedes elegir esto una vez por visita.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div
            className={`chip ${modoSeleccionado === 'participar' ? 'selected' : ''}`}
            style={{ flex: 1, padding: '20px 14px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setModoSeleccionado('participar')}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                margin: '0 auto 12px',
              }}
            >
              ✨
            </div>
            <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>Participar</div>
            <div style={{ fontSize: 11, lineHeight: 1.4 }}>Visible. Puedes conectar.</div>
          </div>

          <div
            className={`chip ${modoSeleccionado === 'explorar' ? 'selected' : ''}`}
            style={{ flex: 1, padding: '20px 14px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setModoSeleccionado('explorar')}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                margin: '0 auto 12px',
              }}
            >
              👁️
            </div>
            <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>Explorar</div>
            <div style={{ fontSize: 11, lineHeight: 1.4 }}>Invisible. Solo mirar.</div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={confirmarModo} disabled={guardandoModo}>
          Continuar
        </button>
        <BottomNav />
      </div>
    )
  }

  if (estado === ESTADOS.ELEGIR_PLAN) {
    return (
      <div className="screen screen-with-nav">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
          <h1 style={{ marginBottom: 6 }}>¡Ya estás participando!</h1>
          <p>{lugarActivo?.nombre}</p>
        </div>

        <h2 style={{ marginBottom: 4, fontSize: 18 }}>Nuestro plan</h2>
        <p style={{ marginBottom: 16 }}>¿Qué te gustaría ahora?</p>

        <div className="stack">
          {OPCIONES_PLAN.map((op) => (
            <div
              key={op.valor}
              className="chip"
              style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => confirmarPlan(op.valor)}
            >
              <span style={{ marginRight: 10 }}>{op.emoji}</span>
              {op.etiqueta}
            </div>
          ))}
        </div>
        <p className="legal-note" style={{ marginTop: 16 }}>
          Puedes cambiarlo cuando quieras desde tu perfil.
        </p>
        <BottomNav />
      </div>
    )
  }

  if (estado === ESTADOS.PARTICIPANDO) {
    const cuentaVisible = personasVisibles(personasActivas).length
    return (
      <div
        className="screen screen-with-nav"
        style={{
          justifyContent: 'center',
          textAlign: 'center',
          position: 'relative',
          background:
            'radial-gradient(circle at 50% 20%, rgba(255,45,142,0.18), transparent 60%)',
        }}
      >
        <style>{`
          @keyframes anillo-llegada-kf {
            0% { transform: scale(0.4); opacity: 0.9; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          .anillo-llegada {
            animation: anillo-llegada-kf 1.4s ease-out both;
          }
        `}</style>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,45,142,0.12)',
            border: '1px solid rgba(255,45,142,0.3)',
            borderRadius: 20,
            padding: '5px 13px',
            margin: '0 auto 24px',
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--magenta)' }}
          />
          <span style={{ color: '#FF87BE', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4 }}>
            ACTIVO AHORA
          </span>
        </div>

        <div
          style={{
            position: 'relative',
            width: 110,
            height: 110,
            margin: '0 auto 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="anillo-llegada"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid var(--magenta)',
              animationDelay: '0.2s',
            }}
          />
          <div
            className="anillo-llegada"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid #B12DFF',
              animationDelay: '0.45s',
            }}
          />
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: '50%',
              background: 'var(--gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 18px 44px -10px rgba(255, 45, 142, 0.55)',
              position: 'relative',
              zIndex: 1,
              fontSize: 38,
            }}
          >
            📍
          </div>
        </div>

        <p style={{ marginBottom: 6, letterSpacing: 0.2 }}>Bienvenido a</p>
        <h1 style={{ fontSize: 27, marginBottom: 22, letterSpacing: -0.4 }}>
          {lugarActivo?.nombre}
        </h1>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 18,
            padding: '12px 20px',
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 15 }}>👥</span>
          <span style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>
            {cuentaVisible === 0 ? 'Todavía nadie más' : `${cuentaVisible} persona${cuentaVisible === 1 ? '' : 's'}`}
          </span>
          <span style={{ fontSize: 12.5 }}>
            {cuentaVisible === 0 ? 'activo aquí' : 'participando ahora'}
          </span>
        </div>

        <button
          className="btn btn-ghost"
          onClick={salirDelLugar}
          style={{ maxWidth: 220, margin: '0 auto' }}
        >
          Salir de este lugar
        </button>

        <BottomNav />
      </div>
    )
  }

  if (estado === ESTADOS.NO_PARTICIPANDO) {
    return (
      <div className="screen screen-with-nav" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="spacer" />
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            margin: '0 auto 24px',
          }}
        >
          👋
        </div>
        <h1 style={{ marginBottom: 10 }}>Ya no estás participando</h1>
        <p style={{ marginBottom: 24 }}>
          Saliste de tu lugar activo. Cuando quieras, busca dónde estás para volver a participar.
        </p>
        <button className="btn btn-primary" onClick={solicitarUbicacionYBuscar}>
          Buscar lugar de nuevo
        </button>
        <div className="spacer" />
        <BottomNav />
      </div>
    )
  }

  // ESTADOS.ERROR
  return (
    <div className="screen screen-with-nav" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ marginBottom: 10 }}>Algo no salió bien</h1>
      <p style={{ marginBottom: 24 }}>{mensajeError}</p>
      <button className="btn btn-primary" onClick={solicitarUbicacionYBuscar}>
        Intentar de nuevo
      </button>
      <BottomNav />
    </div>
  )
}

function EstadoIntermedio({ emoji, titulo, texto }) {
  return (
    <div className="screen screen-with-nav" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div className="radar" style={{ marginBottom: 20 }}>
        <div className="radar-core">{emoji}</div>
      </div>
      <h1 style={{ marginBottom: 10 }}>{titulo}</h1>
      <p>{texto}</p>
      <BottomNav />
    </div>
  )
}
