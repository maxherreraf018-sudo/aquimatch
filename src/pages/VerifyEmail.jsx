import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import {
  reenviarVerificacionCorreo,
  recargarUsuarioActual,
  obtenerUsuario,
  cerrarSesion,
} from '../firebase/auth'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const correo = getAuth().currentUser?.email || ''
  const [verificando, setVerificando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  async function manejarYaVerifique() {
    setError('')
    setMensaje('')
    setVerificando(true)
    try {
      const usuarioActualizado = await recargarUsuarioActual()
      if (!usuarioActualizado?.emailVerified) {
        setError(
          'Todavía no detectamos la verificación. Espera unos segundos después de hacer clic en el enlace e inténtalo de nuevo.'
        )
        return
      }
      const datosUsuario = await obtenerUsuario(usuarioActualizado.uid)
      navigate(datosUsuario?.perfilCompleto ? '/activacion' : '/crear-perfil')
    } catch (err) {
      setError(`No pudimos confirmar la verificación. (${err?.code || err?.message || 'sin código'})`)
    } finally {
      setVerificando(false)
    }
  }

  async function manejarReenviar() {
    if (reenviando) return
    setError('')
    setMensaje('')
    setReenviando(true)
    try {
      await reenviarVerificacionCorreo()
      setMensaje('Te reenviamos el correo de verificación.')
    } catch (err) {
      setError(`No pudimos reenviar el correo. (${err?.code || err?.message || 'sin código'})`)
    } finally {
      setReenviando(false)
    }
  }

  async function manejarCerrarSesion() {
    await cerrarSesion()
    navigate('/auth')
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div className="radar" style={{ marginBottom: 24 }}>
        <div className="radar-core">✉️</div>
      </div>
      <h1 style={{ marginBottom: 8 }}>Revisa tu correo</h1>
      <p style={{ marginBottom: 2 }}>Enviamos un enlace de verificación a</p>
      <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 24 }}>{correo}</p>
      <div className="chip" style={{ textAlign: 'left', marginBottom: 20, cursor: 'default' }}>
        <span style={{ marginRight: 8 }}>💡</span>
        Haz clic en el enlace del correo y vuelve aquí — se actualizará automáticamente.
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 20 }}>
        ¿No lo ves? Revisa tu carpeta de spam o no deseado.
      </p>
      {error && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {mensaje && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>{mensaje}</p>
      )}
      <button
        className="btn btn-primary"
        onClick={manejarYaVerifique}
        disabled={verificando}
        style={{ marginBottom: 16 }}
      >
        {verificando ? 'Comprobando...' : 'Ya hice clic en el enlace'}
      </button>
      <p style={{ fontSize: 13, marginBottom: 24 }}>
        ¿No llegó?{' '}
        <span className="link" onClick={manejarReenviar}>
          {reenviando ? 'Enviando...' : 'Reenviar correo'}
        </span>
      </p>
      <p className="legal-note">
        ¿Correo equivocado?{' '}
        <span className="link" onClick={manejarCerrarSesion}>
          Cerrar sesión
        </span>
      </p>
    </div>
  )
}
