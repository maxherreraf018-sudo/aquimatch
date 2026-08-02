import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import {
  registrarConCorreo,
  iniciarSesionConCorreo,
  iniciarSesionConGoogle,
  iniciarSesionConGoogleNativo,
  crearDocumentoUsuario,
  obtenerUsuario,
  recuperarContrasena,
  cerrarSesion,
} from '../firebase/auth'
import { registrarEvento } from '../firebase/analytics'

// Web Client ID (tipo "Aplicación web" en Google Cloud Console). Es el
// mismo que ya usábamos antes, y el mismo que está en Firebase
// Authentication → Google.
const GOOGLE_WEB_CLIENT_ID = '39224828573-tv3ldb05effvtqpddo76c9nuoo6cj4hp.apps.googleusercontent.com'

// Client ID tipo "iOS" en Google Cloud Console (creado 2026-07-30, bundle id com.aquimatch.app).
const GOOGLE_IOS_CLIENT_ID = '39224828573-1f98utljsje3oe8abobd0qdtup0q45fb.apps.googleusercontent.com'

function IconoGoogle() {
  return (
    <svg className="icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  )
}

function IconoApple() {
  return (
    <svg className="icon" viewBox="0 0 17 20" fill="#1c1c1e" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.94 10.6c-.02-2.1 1.72-3.1 1.8-3.15-.98-1.44-2.5-1.63-3.04-1.66-1.3-.13-2.53.76-3.19.76-.66 0-1.68-.74-2.76-.72-1.42.02-2.73.83-3.46 2.1-1.48 2.56-.38 6.36 1.06 8.44.7 1.02 1.54 2.16 2.64 2.12 1.06-.04 1.46-.68 2.74-.68 1.28 0 1.64.68 2.76.66 1.14-.02 1.86-1.04 2.56-2.06.8-1.18 1.13-2.33 1.15-2.39-.03-.01-2.2-.84-2.26-3.32z" />
      <path d="M11.86 4.3c.58-.7.98-1.68.87-2.65-.84.03-1.86.56-2.46 1.26-.54.62-1.02 1.62-.9 2.57.93.07 1.9-.47 2.5-1.18z" />
    </svg>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  // Arranca en modo "iniciar sesión" (false). El registro queda como
  // opción secundaria, accesible desde el link de abajo.
  const [modoRegistro, setModoRegistro] = useState(false)
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const [recuperando, setRecuperando] = useState(false)
  // Cuenta de Google recién autenticada, primera vez (sin perfil todavía):
  // se le pide aceptar los Términos acá antes de crear su perfil.
  const [usuarioGooglePendiente, setUsuarioGooglePendiente] = useState(null)
  const [aceptaTerminosGoogle, setAceptaTerminosGoogle] = useState(false)
  const [creandoCuenta, setCreandoCuenta] = useState(false)

  async function manejarEnvio(e) {
    e.preventDefault()
    if (!aceptaTerminos) {
      setError('Debes aceptar los Términos y la Política de Privacidad para continuar.')
      return
    }
    setError('')
    setMensaje('')
    setCargando(true)
    try {
      if (modoRegistro) {
        // Cuenta recién creada: el correo de verificación ya se envió
        // dentro de registrarConCorreo(). Siempre pasa primero por ahí.
        await registrarConCorreo(correo, contrasena)
        registrarEvento('sign_up', { method: 'email' })
        navigate('/verificar-correo')
        return
      }

      const usuarioFirebase = await iniciarSesionConCorreo(correo, contrasena)
      if (!usuarioFirebase.emailVerified) {
        navigate('/verificar-correo')
        return
      }
      const datosUsuario = await obtenerUsuario(usuarioFirebase.uid)
      navigate(datosUsuario?.perfilCompleto ? '/activacion' : '/crear-perfil')
    } catch (err) {
      setError(traducirErrorFirebase(err.code))
    } finally {
      setCargando(false)
    }
  }

  async function manejarGoogle() {
    setError('')
    setMensaje('')
    setCargando(true)
    try {
      let usuarioFirebase

      if (Capacitor.isNativePlatform()) {
        // Dentro de la app empacada (Android/iOS): usa el selector nativo
        // de cuentas de Google, no un popup web (eso no funciona aquí).
        await SocialLogin.initialize({
          google: {
            webClientId: GOOGLE_WEB_CLIENT_ID, // usado en Android y Web
            iOSClientId: GOOGLE_IOS_CLIENT_ID, // usado solo en iOS
            iOSServerClientId: GOOGLE_WEB_CLIENT_ID, // para que Firebase pueda verificar el token también en iOS
          },
        })
        const resultado = await SocialLogin.login({
          provider: 'google',
          options: {},
        })
        // Importante: el idToken viene dentro de resultado.result, no
        // directo en resultado (así lo entrega este plugin).
        const idToken = resultado?.result?.idToken
        if (!idToken) {
          throw new Error('No recibimos el token de Google. Intenta de nuevo.')
        }
        usuarioFirebase = await iniciarSesionConGoogleNativo(idToken)
      } else {
        // En el navegador normal (probando en la web): sigue usando el
        // popup de siempre.
        usuarioFirebase = await iniciarSesionConGoogle()
      }

      const datosUsuario = await obtenerUsuario(usuarioFirebase.uid)
      if (datosUsuario) {
        // Ya tenía cuenta (ya había aceptado los Términos antes) — entra derecho.
        navigate(datosUsuario.perfilCompleto ? '/activacion' : '/crear-perfil')
        return
      }
      // Cuenta de Google nueva: todavía no existe su perfil en la base de
      // datos. Antes de crearlo, le pedimos que acepte los Términos.
      setUsuarioGooglePendiente(usuarioFirebase)
    } catch (err) {
      setError(`No pudimos iniciar sesión con Google. (${err?.code || err?.message || 'sin código'})`)
    } finally {
      setCargando(false)
    }
  }

  async function manejarAceptarTerminosGoogle() {
    if (!aceptaTerminosGoogle || !usuarioGooglePendiente) return
    setCreandoCuenta(true)
    try {
      await crearDocumentoUsuario(usuarioGooglePendiente.uid, {
        correo: usuarioGooglePendiente.email,
        nombre: usuarioGooglePendiente.displayName || '',
      })
      registrarEvento('sign_up', { method: 'google' })
      navigate('/crear-perfil')
    } catch (err) {
      setError('No pudimos crear tu cuenta. Intenta de nuevo.')
      setCreandoCuenta(false)
    }
  }

  // Si cancela, cerramos la sesión de Google que se acababa de abrir — no
  // queremos dejarla logueada sin haber aceptado los Términos.
  async function manejarCancelarGoogle() {
    await cerrarSesion()
    setUsuarioGooglePendiente(null)
    setAceptaTerminosGoogle(false)
  }

  async function manejarRecuperarContrasena() {
    if (recuperando) return
    setError('')
    setMensaje('')
    if (!correo) {
      setError('Escribe tu correo arriba primero, y luego toca "¿Olvidaste tu contraseña?".')
      return
    }
    setRecuperando(true)
    try {
      await recuperarContrasena(correo)
      setMensaje('Te enviamos un correo con un enlace para crear una nueva contraseña.')
    } catch (err) {
      setError(traducirErrorFirebase(err.code))
    } finally {
      setRecuperando(false)
    }
  }

  if (usuarioGooglePendiente) {
    return (
      <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          {usuarioGooglePendiente.photoURL && (
            <img
              src={usuarioGooglePendiente.photoURL}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        {usuarioGooglePendiente.displayName && (
          <p style={{ fontSize: 13, marginBottom: 4 }}>Hola, {usuarioGooglePendiente.displayName}</p>
        )}
        <h1 style={{ marginBottom: 22 }}>Un último paso</h1>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 12.5,
            color: 'var(--text-dim)',
            cursor: 'pointer',
            lineHeight: 1.4,
            textAlign: 'left',
            marginBottom: 24,
          }}
        >
          <input
            type="checkbox"
            checked={aceptaTerminosGoogle}
            onChange={(e) => setAceptaTerminosGoogle(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
          />
          <span>
            He leído y acepto los{' '}
            <a href="/terminos" target="_blank" rel="noopener noreferrer" className="link">
              Términos y Condiciones
            </a>{' '}
            y la{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="link">
              Política de Privacidad
            </a>
            .
          </span>
        </label>
        {error && <p className="error-text">{error}</p>}
        <button
          className="btn btn-primary"
          onClick={manejarAceptarTerminosGoogle}
          disabled={!aceptaTerminosGoogle || creandoCuenta}
        >
          {creandoCuenta ? 'Un momento...' : 'Aceptar y continuar'}
        </button>
        <button className="btn btn-ghost" onClick={manejarCancelarGoogle} disabled={creandoCuenta}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="progress">
        <div className="progress-dot active" />
        <div className="progress-dot" />
        <div className="progress-dot" />
        <div className="progress-dot" />
      </div>
      <p
        style={{
          textAlign: 'center',
          fontWeight: 600,
          fontSize: 15,
          marginBottom: 16,
        }}
      >
        <span style={{ color: '#fff' }}>Aquí</span>
        <span style={{ color: '#FF2D8E' }}>Match</span>
      </p>
      <h1 style={{ marginBottom: 24, textAlign: 'center' }}>Bienvenido 👋</h1>
      <div className="stack">
        <button className="btn btn-social" onClick={manejarGoogle} disabled={cargando}>
          <IconoGoogle />
          Continuar con Google
        </button>
        <button className="btn btn-social" disabled>
          <IconoApple />
          Continuar con Apple (próximamente)
        </button>
        <div className="divider">o</div>
        <form onSubmit={manejarEnvio} className="stack">
          <div className="field">
            <label>Correo electrónico</label>
            <input
              className="input"
              type="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              className="input"
              type="password"
              required
              minLength={6}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
            {!modoRegistro && (
              <p style={{ textAlign: 'right', marginTop: 8 }}>
                <span className="link" onClick={manejarRecuperarContrasena} style={{ fontSize: 12.5 }}>
                  {recuperando ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
                </span>
              </p>
            )}
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 12.5,
              color: 'var(--text-dim)',
              cursor: 'pointer',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
            />
            <span>
              He leído y acepto los{' '}
              <a href="/terminos" target="_blank" rel="noopener noreferrer" className="link">
                Términos y Condiciones
              </a>{' '}
              y la{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="link">
                Política de Privacidad
              </a>
              .
            </span>
          </label>

          {error && <p className="error-text">{error}</p>}
          {mensaje && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>{mensaje}</p>
          )}
          <button className="btn btn-primary" type="submit" disabled={cargando || !aceptaTerminos}>
            {cargando ? 'Un momento...' : 'Continuar'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14 }}>
          {modoRegistro ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
          <span
            className="link"
            onClick={() => {
              setModoRegistro(!modoRegistro)
              setError('')
              setMensaje('')
            }}
          >
            {modoRegistro ? 'Inicia sesión' : 'Regístrate'}
          </span>
        </p>
      </div>
    </div>
  )
}

function traducirErrorFirebase(codigo) {
  const mapa = {
    'auth/email-already-in-use': 'Ese correo ya está registrado. Intenta iniciar sesión.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
  }
  return mapa[codigo] || 'Ocurrió un error. Intenta nuevamente.'
}
