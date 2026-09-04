import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { IconVolver, IconOjo, IconOjoTachado } from '../components/Icons'
import { VERSION_NOMBRE, VERSION_BUILD } from '../version'

const MIN_CONTRASENA = 6

// Cómo entró la persona a la app. Firebase guarda esto en providerData, y no
// es un dato cosmético: si entró con Google o con Apple, su contraseña no es
// nuestra y no hay nada que podamos cambiar desde acá.
const PROVEEDORES = {
  password: { etiqueta: 'Correo y contraseña', propia: true },
  'google.com': { etiqueta: 'Cuenta de Google', propia: false, dueno: 'Google' },
  'apple.com': { etiqueta: 'Cuenta de Apple', propia: false, dueno: 'Apple' },
}

export default function ConfiguracionCuenta() {
  const navigate = useNavigate()
  const usuario = getAuth().currentUser

  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [verContrasenas, setVerContrasenas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  const proveedorId = usuario?.providerData?.[0]?.providerId || 'password'
  const proveedor = PROVEEDORES[proveedorId] || PROVEEDORES.password
  const puedeCambiarContrasena = proveedor.propia

  async function manejarGuardar() {
    if (guardando) return
    setError('')

    if (!actual) {
      setError('Escribe tu contraseña actual.')
      return
    }
    if (nueva.length < MIN_CONTRASENA) {
      setError(`La contraseña nueva debe tener al menos ${MIN_CONTRASENA} caracteres.`)
      return
    }
    if (nueva === actual) {
      setError('La contraseña nueva tiene que ser distinta de la actual.')
      return
    }

    setGuardando(true)
    try {
      // Firebase exige haber iniciado sesión hace poco para cambiar la
      // contraseña. Pedir la actual sirve para las dos cosas a la vez:
      // cumple ese requisito y evita que alguien que agarre el teléfono
      // desbloqueado te cambie la contraseña y te deje afuera de tu cuenta.
      const credencial = EmailAuthProvider.credential(usuario.email, actual)
      await reauthenticateWithCredential(usuario, credencial)
      await updatePassword(usuario, nueva)
      setActual('')
      setNueva('')
      setAbierto(false)
      setListo(true)
    } catch (err) {
      setError(mensajeDeError(err?.code))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="screen">
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-dim)',
          fontSize: 14,
          cursor: 'pointer',
          alignSelf: 'flex-start',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <IconVolver size={16} /> Volver
      </button>

      <h1 style={{ marginBottom: 24 }}>Configuración de la cuenta</h1>

      <Etiqueta texto="Cómo inicias sesión" />
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          padding: '13px 15px',
          marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--text)' }}>{proveedor.etiqueta}</p>
        {usuario?.email && (
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3 }}>{usuario.email}</p>
        )}
      </div>

      <Etiqueta texto="Seguridad" />
      {puedeCambiarContrasena ? (
        <>
          {listo && !abierto && (
            <p style={{ fontSize: 13, color: 'var(--success)', marginBottom: 10 }}>
              Contraseña cambiada.
            </p>
          )}

          {!abierto ? (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAbierto(true)
                setListo(false)
                setError('')
              }}
              style={{ marginBottom: 8 }}
            >
              Cambiar contraseña
            </button>
          ) : (
            <div className="stack" style={{ marginBottom: 8 }}>
              <div className="field">
                <label>Contraseña actual</label>
                <input
                  className="input"
                  type={verContrasenas ? 'text' : 'password'}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="field">
                <label>Contraseña nueva</label>
                <input
                  className="input"
                  type={verContrasenas ? 'text' : 'password'}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  placeholder={`Mínimo ${MIN_CONTRASENA} caracteres`}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="button"
                onClick={() => setVerContrasenas((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 0,
                  alignSelf: 'flex-start',
                }}
              >
                {verContrasenas ? <IconOjoTachado size={15} /> : <IconOjo size={15} />}
                {verContrasenas ? 'Ocultar contraseñas' : 'Ver contraseñas'}
              </button>

              {error && <p className="error-text">{error}</p>}

              <button className="btn btn-primary" onClick={manejarGuardar} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
                onClick={() => {
                  setAbierto(false)
                  setActual('')
                  setNueva('')
                  setError('')
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 24 }}>
            Te pedimos la contraseña actual antes de cambiarla.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.55 }}>
          Entraste con tu {proveedor.etiqueta.toLowerCase()}, así que tu contraseña la administra{' '}
          {proveedor.dueno} y se cambia desde ahí. Nosotros nunca la vemos.
        </p>
      )}

      <Etiqueta texto="Legal" />
      <button
        className="btn btn-secondary"
        onClick={() => navigate('/terminos')}
        style={{ marginBottom: 10 }}
      >
        Términos y condiciones
      </button>
      <button className="btn btn-secondary" onClick={() => navigate('/privacidad')}>
        Política de privacidad
      </button>

      <p
        style={{
          fontSize: 12,
          color: 'var(--text-faint)',
          textAlign: 'center',
          marginTop: 28,
        }}
      >
        AquíMatch {VERSION_NOMBRE} ({VERSION_BUILD})
      </p>

      <div className="spacer" />
    </div>
  )
}

function Etiqueta({ texto }) {
  return (
    <p
      style={{
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        marginBottom: 8,
      }}
    >
      {texto}
    </p>
  )
}

function mensajeDeError(codigo) {
  // 'invalid-credential' es lo que devuelve Firebase hoy cuando la contraseña
  // está mala; 'wrong-password' es el código antiguo, que sigue apareciendo en
  // algunas versiones. Los dos significan lo mismo para la persona.
  if (codigo === 'auth/wrong-password' || codigo === 'auth/invalid-credential') {
    return 'La contraseña actual no es correcta.'
  }
  if (codigo === 'auth/weak-password') {
    return `La contraseña nueva debe tener al menos ${MIN_CONTRASENA} caracteres.`
  }
  if (codigo === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
  }
  if (codigo === 'auth/network-request-failed') {
    return 'No hay conexión. Revisa tu internet e intenta de nuevo.'
  }
  return 'No pudimos cambiar tu contraseña. Intenta de nuevo.'
}
