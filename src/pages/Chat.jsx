import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { obtenerConexion, obtenerPerfilBasico, edadDePerfil } from '../services/discover'
import { obtenerEstadoConexion } from '../services/chatsList'
import {
  enviarMensaje,
  escucharMensajes,
  bloquearUsuario,
  reportarUsuario,
  deshacerMatch,
  marcarChatLeido,
  PREGUNTAS_ROMPEHIELO,
} from '../services/chat'
import { OPCIONES_INTERES } from '../data/intereses'
import FotoCarrusel from '../components/FotoCarrusel'
import { IconVolver, IconMenu, IconEnviar, IconCerrar } from '../components/Icons'

const MOTIVOS_REPORTE = ['Perfil falso', 'Foto falsa', 'Acoso', 'Lenguaje ofensivo', 'Otro']
const MAPA_INTERESES = Object.fromEntries(OPCIONES_INTERES.map((op) => [op.valor, op]))

// Convierte el campo creadoEn (Timestamp de Firestore) a un objeto Date de
// JavaScript. Mientras el mensaje se está enviando (antes de que el
// servidor confirme la hora), creadoEn puede llegar como null por un
// instante — en ese caso devolvemos null y no mostramos hora todavía.
function aFecha(creadoEn) {
  if (!creadoEn) return null
  return typeof creadoEn.toDate === 'function' ? creadoEn.toDate() : new Date(creadoEn)
}

// Hora chiquita debajo de cada burbuja, ej: "14:32".
function formatearHora(fecha) {
  if (!fecha) return ''
  return fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function esMismoDia(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Separador de fecha entre grupos de mensajes, ej: "Hoy", "Ayer, 20:10",
// o "15 jul" para fechas más antiguas.
function formatearSeparadorFecha(fecha) {
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)

  if (esMismoDia(fecha, hoy)) return 'Hoy'
  if (esMismoDia(fecha, ayer)) return `Ayer, ${formatearHora(fecha)}`
  return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [conexion, setConexion] = useState(null)
  const [otroPerfil, setOtroPerfil] = useState(null)
  const [otroEstadoConexion, setOtroEstadoConexion] = useState({ activo: false, texto: null })
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [mostrarReporte, setMostrarReporte] = useState(false)
  const [mostrarPerfil, setMostrarPerfil] = useState(false)
  const [mostrarConfirmarEliminar, setMostrarConfirmarEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [intentos, setIntentos] = useState(0)
  const finRef = useRef(null)

  useEffect(() => {
    let activo = true
    let detener = () => {}

    async function iniciar() {
      setCargando(true)
      setErrorCarga('')
      try {
        const conexionData = await obtenerConexion(id)
        if (!activo) return
        if (!conexionData || conexionData.deshecho) {
          navigate('/activacion')
          return
        }
        const otroUid = conexionData.usuarios.find((u) => u !== uid)
        const [perfilOtro, estadoConexion] = await Promise.all([
          obtenerPerfilBasico(otroUid),
          obtenerEstadoConexion(otroUid),
        ])
        if (!activo) return
        setConexion({ ...conexionData, otroUid })
        setOtroPerfil(perfilOtro)
        setOtroEstadoConexion(estadoConexion)
        setCargando(false)

        // Si esta conexión ya se había eliminado antes y se rehizo el
        // match, solo se muestran los mensajes posteriores a ese borrado.
        detener = escucharMensajes(id, setMensajes, conexionData.deshechoEn || null)
      } catch (err) {
        if (!activo) return
        setErrorCarga('No pudimos cargar esta conversación. Revisa tu conexión e intenta de nuevo.')
        setCargando(false)
      }
    }

    iniciar()
    return () => {
      activo = false
      detener()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, intentos])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Marca el chat como leído al entrar, y de nuevo cada vez que llega un
  // mensaje mientras lo tienes abierto.
  useEffect(() => {
    if (id && uid && !errorCarga) marcarChatLeido(id, uid)
  }, [id, uid, mensajes.length, errorCarga])

  async function manejarEnviar(textoAEnviar) {
    const contenido = (textoAEnviar ?? texto).trim()
    if (!contenido || enviando) return
    setEnviando(true)
    try {
      await enviarMensaje(id, uid, contenido)
      setTexto('')
    } finally {
      setEnviando(false)
    }
  }

  async function manejarBloquear() {
    await bloquearUsuario(uid, conexion.otroUid)
    navigate('/descubrir')
  }

  async function manejarReportar(motivo) {
    await reportarUsuario(uid, conexion.otroUid, id, motivo)
    setMostrarReporte(false)
    setMenuAbierto(false)
  }

  async function manejarEliminar() {
    if (eliminando) return
    setEliminando(true)
    try {
      await deshacerMatch(id)
      navigate('/descubrir')
    } catch (err) {
      setEliminando(false)
      setMostrarConfirmarEliminar(false)
    }
  }

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Cargando conversación...</p>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
        <p style={{ marginBottom: 20 }}>{errorCarga}</p>
        <div className="stack" style={{ width: '100%' }}>
          <button className="btn btn-primary" onClick={() => setIntentos((n) => n + 1)}>
            Intentar de nuevo
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/mis-chats')}>
            Volver a Mis chats
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="screen"
      style={{
        padding: 'calc(20px + env(safe-area-inset-top)) 0 calc(16px + env(safe-area-inset-bottom))',
        height: '100dvh',
        overflow: 'hidden',
      }}
    >
      {/* Encabezado */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => navigate('/mis-chats')}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', display: 'flex', cursor: 'pointer', padding: 0 }}
        >
          <IconVolver size={22} />
        </button>
        <div
          onClick={() => setMostrarPerfil(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--gradient)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          {otroPerfil?.fotoPrincipal && (
            <img
              src={otroPerfil.fotoPrincipal}
              alt=""
              className="foto-persona"
            />
          )}
        </div>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setMostrarPerfil(true)}>
          <div style={{ fontWeight: 600 }}>{otroPerfil?.nombre || 'Alguien'}</div>
          {otroEstadoConexion.activo ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
              Activo/a ahora
            </div>
          ) : (
            otroEstadoConexion.texto && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {otroEstadoConexion.texto.replace('Activo', 'Activo/a')}
              </div>
            )
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', display: 'flex', cursor: 'pointer', padding: 0 }}
          >
            <IconMenu size={20} />
          </button>
          {menuAbierto && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 28,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                zIndex: 10,
                minWidth: 160,
              }}
            >
              <MenuItem
                texto="Eliminar conversación"
                onClick={() => {
                  setMostrarConfirmarEliminar(true)
                  setMenuAbierto(false)
                }}
              />
              <MenuItem texto="Reportar" onClick={() => setMostrarReporte(true)} />
              <MenuItem texto="Bloquear" onClick={manejarBloquear} peligro />
            </div>
          )}
        </div>
      </div>

      {mostrarReporte && (
        <div className="screen" style={{ position: 'absolute', inset: 0, background: 'var(--bg)', zIndex: 20 }}>
          <h2 style={{ marginBottom: 16 }}>¿Por qué reportas a {otroPerfil?.nombre}?</h2>
          <div className="stack">
            {MOTIVOS_REPORTE.map((motivo) => (
              <div
                key={motivo}
                className="chip"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => manejarReportar(motivo)}
              >
                {motivo}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setMostrarReporte(false)}>
            Cancelar
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mensajes.length === 0 && (
          <div className="stack" style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 13, textAlign: 'center', color: 'var(--text-faint)' }}>
              Rompehielo sugerido (opcional)
            </p>
            {PREGUNTAS_ROMPEHIELO.map((pregunta) => (
              <div
                key={pregunta}
                className="chip"
                style={{ textAlign: 'left', cursor: 'pointer', fontSize: 14 }}
                onClick={() => manejarEnviar(pregunta)}
              >
                {pregunta}
              </div>
            ))}
          </div>
        )}

        {mensajes.map((m, i) => {
          const fecha = aFecha(m.creadoEn)
          const fechaAnterior = i > 0 ? aFecha(mensajes[i - 1].creadoEn) : null
          const mostrarSeparador = fecha && (!fechaAnterior || !esMismoDia(fecha, fechaAnterior))

          return (
            <div key={m.id}>
              {mostrarSeparador && (
                <p
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    margin: '10px 0',
                  }}
                >
                  {formatearSeparadorFecha(fecha)}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: m.autorUid === uid ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className={m.autorUid === uid ? 'mensaje-burbuja-der' : 'mensaje-burbuja-izq'}
                  style={{
                    maxWidth: '75%',
                    background: m.autorUid === uid ? 'var(--gradient)' : 'var(--bg-card)',
                    color: m.autorUid === uid ? 'white' : 'var(--text)',
                    padding: '10px 14px',
                    borderRadius: 16,
                    fontSize: 15,
                  }}
                >
                  {m.texto}
                </div>
                {fecha && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)', margin: '4px 2px 0' }}>
                    {formatearHora(fecha)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        <div ref={finRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 20px 0' }}>
        <input
          className="input"
          placeholder="Escribe un mensaje..."
          value={texto}
          // Mismo tope que exigen las reglas de Firestore para un mensaje.
          // Acá está para que la persona no pueda pasarse y reciba un error
          // después de haber escrito; quien de verdad lo hace cumplir es la
          // regla del servidor.
          maxLength={2000}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && manejarEnviar()}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          style={{ width: 50, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => manejarEnviar()}
          disabled={enviando}
        >
          <IconEnviar size={18} />
        </button>
      </div>

      {/* Confirmación antes de deshacer el match — borra la conversación para las dos personas */}
      {mostrarConfirmarEliminar && (
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
            <div style={{ fontSize: 26, marginBottom: 10 }}>💔</div>
            <h2 style={{ fontSize: 15, color: 'var(--text)', marginBottom: 10 }}>¿Eliminar esta conversación?</h2>
            <p style={{ fontSize: 12, marginBottom: 18, lineHeight: 1.6 }}>
              Se borra para los dos y se deshace el match. Si vuelven a coincidir en un lugar,
              pueden conectar de nuevo desde cero.
            </p>
            <button
              className="btn"
              style={{ width: '100%', padding: '11px 0', fontSize: 13, background: 'var(--danger)', color: '#fff', marginBottom: 10 }}
              onClick={manejarEliminar}
              disabled={eliminando}
            >
              {eliminando ? 'Eliminando...' : 'Eliminar y deshacer match'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '9px 0', fontSize: 12.5 }}
              onClick={() => setMostrarConfirmarEliminar(false)}
              disabled={eliminando}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Perfil completo de la otra persona — se abre al tocar su foto arriba */}
      {mostrarPerfil && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <FotoCarrusel
            fotos={[otroPerfil?.fotoPrincipal, ...(otroPerfil?.fotosAdicionales || [])]}
            alto="100%"
          >
            <div
              onClick={() => setMostrarPerfil(false)}
              style={{
                position: 'absolute',
                top: 'calc(12px + env(safe-area-inset-top))',
                right: 12,
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.45)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 3,
                cursor: 'pointer',
              }}
            >
              <IconCerrar size={16} />
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '28px 20px calc(24px + env(safe-area-inset-bottom))',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.2) 55%, transparent)',
                zIndex: 1,
              }}
            >
              <h2 style={{ color: 'white', fontSize: 24, marginBottom: otroPerfil?.intereses?.length ? 10 : 0 }}>
                {otroPerfil?.nombre || 'Alguien'}
                {edadDePerfil(otroPerfil) ? `, ${edadDePerfil(otroPerfil)}` : ''}
              </h2>
              {otroPerfil?.intereses?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {otroPerfil.intereses.map((valor) => {
                    const op = MAPA_INTERESES[valor]
                    if (!op) return null
                    return (
                      <span
                        key={valor}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 16,
                          background: 'rgba(255,255,255,0.15)',
                          color: 'rgba(255,255,255,0.95)',
                          fontSize: 12,
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
      )}
    </div>
  )
}

function MenuItem({ texto, onClick, peligro }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        fontSize: 14,
        color: peligro ? 'var(--danger)' : 'var(--text)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {texto}
    </div>
  )
}
