import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Le pregunta a Firebase si el correo ya quedó verificado. Devuelve true
  // solo cuando lo está, para que quien la llama decida si avisar o callarse.
  const comprobar = useCallback(async () => {
    const usuarioActualizado = await recargarUsuarioActual()
    if (!usuarioActualizado?.emailVerified) return false
    const datosUsuario = await obtenerUsuario(usuarioActualizado.uid)
    navigate(datosUsuario?.perfilCompleto ? '/activacion' : '/crear-perfil')
    return true
  }, [navigate])

  // Esta pantalla prometía "vuelve aquí — se actualizará automáticamente" y no
  // comprobaba nada: la única forma de avanzar era apretar el botón. La persona
  // hacía clic en el enlace del correo, volvía a la app, se quedaba mirando una
  // pantalla que decía que se iba a actualizar sola, y no pasaba nada.
  //
  // Ahora sí pregunta sola, y además pregunta de inmediato al volver a la app —
  // que es justo el momento en que uno vuelve del correo.
  const comprobando = useRef(false)
  useEffect(() => {
    let vivo = true
    async function mirar() {
      // Sin este candado, una comprobación lenta se pisa con la siguiente.
      if (comprobando.current || !vivo) return
      comprobando.current = true
      try {
        await comprobar()
      } catch (err) {
        // Un fallo puntual (red intermitente) no tiene por qué mostrar un
        // error: el siguiente intento llega en unos segundos.
      } finally {
        comprobando.current = false
      }
    }
    const intervalo = setInterval(mirar, 4000)
    const alVolver = () => {
      if (document.visibilityState === 'visible') mirar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [comprobar])

  async function manejarYaVerifique() {
    setError('')
    setMensaje('')
    setVerificando(true)
    try {
      const listo = await comprobar()
      if (!listo) {
        setError(
          'Todavía no detectamos la verificación. Revisa que hayas tocado el botón de confirmación en la página que abrió el enlace — con abrir el correo no alcanza.'
        )
      }
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
      {/* El paso del botón NO es un detalle. Abrir el enlace del correo no
          verifica nada: lleva a una página de Firebase donde hay que tocar un
          botón ("Verificación completa"), y recién ahí queda verificado. La
          instrucción decía solo "abre el enlace y vuelve", así que la persona
          hacía exactamente lo que se le pedía y no funcionaba. */}
      <div className="chip" style={{ textAlign: 'left', marginBottom: 20, cursor: 'default' }}>
        <span style={{ marginRight: 8 }}>💡</span>
        <span>
          Abre el enlace del correo y, en la página que se abre,{' '}
          <strong style={{ color: 'var(--text)' }}>toca el botón de confirmación</strong>. Después
          vuelve aquí: esta pantalla avanza sola.
        </span>
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
