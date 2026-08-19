import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { IconVolver, IconOjo, IconOjoTachado } from '../components/Icons'
import { registrarEvento } from '../firebase/analytics'
import {
  PRECIO_MENSUAL,
  PRECIO_ANUAL,
  AHORRO_ANUAL_PORCENTAJE,
  formatearCLP,
  obtenerInteresGold,
  registrarInteresGold,
  cancelarInteresGold,
} from '../services/gold'

// Pantalla de Gold ANTES de que exista el cobro. Muestra las funciones y los
// precios de verdad, y en lugar del botón de compra deja un "avísame".
//
// Regla que no hay que romper acá: en ningún momento esto puede parecer una
// compra. Nada de "Suscribirme" ni "Continuar al pago". La persona tiene que
// entender de una lectura que no se le está cobrando nada — si no, es engaño,
// y además las dos tiendas lo rechazan.

// Ícono de deshacer (flecha que vuelve), propio de esta pantalla.
function IconDeshacer({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9h11a5 5 0 010 10H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M8 5L4 9l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Ícono de local favorito (pin con estrella implícita).
function IconLocal({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.5c-3.6 0-6.5 2.9-6.5 6.5 0 4.9 6.5 12.5 6.5 12.5s6.5-7.6 6.5-12.5c0-3.6-2.9-6.5-6.5-6.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.3 9h5.4M12 6.6v4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

const FUNCIONES = [
  {
    Icono: IconOjo,
    titulo: 'Mira quién te mostró interés',
    detalle: 'Sin esperar a que el match sea mutuo. La primera vez es gratis para todos.',
  },
  {
    Icono: IconLocal,
    titulo: 'Tus locales favoritos',
    detalle:
      'Cuánta gente hay activa ahora mismo en tus 2 lugares, antes de salir de tu casa. Solo el número, nunca perfiles.',
  },
  {
    Icono: IconDeshacer,
    titulo: 'Deshaz un paso',
    detalle: 'Te arrepentiste de haber pasado a alguien. Sin Gold no hay vuelta atrás.',
  },
  {
    Icono: IconOjoTachado,
    titulo: 'Modo incógnito',
    detalle: 'Mira quién está en el lugar sin aparecer tú en Descubrir.',
  },
]

export default function Gold() {
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid

  const [cargando, setCargando] = useState(true)
  const [interes, setInteres] = useState(null)
  const [planElegido, setPlanElegido] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    async function cargar() {
      // El evento va acá y no en el onClick de la entrada del Perfil: lo que
      // importa medir es cuánta gente REALMENTE llegó a ver los precios, que
      // es el denominador de la tasa de conversión.
      registrarEvento('gold_paywall_visto')
      try {
        const guardado = await obtenerInteresGold(uid)
        if (!activo) return
        setInteres(guardado)
        if (guardado?.plan && guardado.plan !== 'sin_elegir') setPlanElegido(guardado.plan)
      } catch (err) {
        // Que no se pueda leer el interés previo no puede dejar la pantalla en
        // blanco: en el peor caso se muestra como si nunca hubiera avisado.
      } finally {
        if (activo) setCargando(false)
      }
    }
    if (uid) cargar()
    return () => {
      activo = false
    }
  }, [uid])

  async function manejarAvisame() {
    if (guardando) return
    setGuardando(true)
    setError('')
    try {
      await registrarInteresGold(uid, planElegido)
      setInteres({ plan: planElegido || 'sin_elegir' })
    } catch (err) {
      setError('No pudimos guardar tu aviso. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function manejarCancelar() {
    if (guardando) return
    setGuardando(true)
    setError('')
    try {
      await cancelarInteresGold(uid)
      setInteres(null)
    } catch (err) {
      setError('No pudimos cancelar el aviso. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div
          onClick={() => navigate(-1)}
          style={{ color: 'var(--text-dim)', cursor: 'pointer', display: 'inline-flex' }}
        >
          <IconVolver size={22} />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '5px 14px',
            borderRadius: 100,
            background: 'var(--gradient)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.16em',
            marginBottom: 14,
          }}
        >
          GOLD
        </span>
        <h1 style={{ fontSize: 25, lineHeight: 1.25, marginBottom: 10 }}>
          Lo estamos
          <br />
          <span style={{ color: 'var(--magenta)' }}>terminando.</span>
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Todavía no puedes activarlo. Esto es lo que va a incluir, y cuánto va a costar.
        </p>
      </div>

      <div className="grupo-perfil" style={{ marginBottom: 22 }}>
        {FUNCIONES.map(({ Icono, titulo, detalle }, i) => (
          <div key={titulo}>
            {i > 0 && <div className="separador-grupo" />}
            <div style={{ display: 'flex', gap: 13, padding: 14 }}>
              <span style={{ color: 'var(--magenta)', flexShrink: 0, marginTop: 1 }}>
                <Icono size={20} />
              </span>
              <div>
                <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                  {titulo}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>{detalle}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, textAlign: 'center', marginBottom: 22 }}>
        Y una insignia Gold junto a tu nombre en Descubrir.
      </p>

      <p style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
        Precio
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <TarjetaPlan
          seleccionado={planElegido === 'mensual'}
          onClick={() => setPlanElegido('mensual')}
          etiqueta="Mensual"
          monto={formatearCLP(PRECIO_MENSUAL)}
          periodo="por mes"
        />
        <TarjetaPlan
          seleccionado={planElegido === 'anual'}
          onClick={() => setPlanElegido('anual')}
          etiqueta="Anual"
          monto={formatearCLP(PRECIO_ANUAL)}
          periodo="por año"
          destacado={`Ahorra ${AHORRO_ANUAL_PORCENTAJE}%`}
        />
      </div>

      {cargando ? (
        <p style={{ fontSize: 12.5, textAlign: 'center' }}>Un momento...</p>
      ) : interes ? (
        <>
          <div
            style={{
              padding: '13px 16px',
              borderRadius: 14,
              background: 'rgba(255, 45, 142, 0.12)',
              border: '1px solid var(--magenta)',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>
              Te avisamos cuando esté
            </div>
            <div style={{ fontSize: 12, marginTop: 3 }}>
              Te llega una notificación. No hay nada cobrado.
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12.5 }}
            onClick={manejarCancelar}
            disabled={guardando}
          >
            {guardando ? 'Cancelando...' : 'Ya no me avises'}
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-primary" onClick={manejarAvisame} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Avísame cuando esté'}
          </button>
          {/* Esta línea existe solo para dejar claro que no hay cobro. No debe
              insinuar que Gold podría no llegar a existir: nadie pide que le
              avisen de algo que capaz no se termina. */}
          <p style={{ fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 1.55 }}>
            No se te cobra nada. Te avisamos apenas puedas activarlo.
          </p>
        </>
      )}

      {error && (
        <p className="error-text" style={{ textAlign: 'center', marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="spacer" />
    </div>
  )
}

function TarjetaPlan({ seleccionado, onClick, etiqueta, monto, periodo, destacado }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 12px',
        borderRadius: 16,
        background: seleccionado ? 'rgba(255, 45, 142, 0.12)' : 'var(--bg-card)',
        border: `1px solid ${seleccionado ? 'var(--magenta)' : 'var(--border)'}`,
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 5 }}>{etiqueta}</div>
      <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>{monto}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{periodo}</div>
      {destacado && (
        <div style={{ fontSize: 10.5, color: 'var(--magenta)', fontWeight: 600, marginTop: 6 }}>
          {destacado}
        </div>
      )}
    </div>
  )
}
