import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { actualizarUsuario, guardarDatosPrivados } from '../firebase/auth'
import { subirSelfieAlStorage } from '../services/verificacion'
import { elegirFoto, CameraSource, CameraDirection } from '../services/fotos'
import { registrarEvento } from '../firebase/analytics'
import { IconAlerta, IconPendiente } from '../components/Icons'

// Bloquea el paso a Activación/Descubrir mientras la selfie de verificación
// está "pendiente" (esperando a la Cloud Function) o llegó "rechazado" /
// "error_verificacion". Usuarios sin este campo (cuentas previas a esta
// función) o con "aprobado" pasan directo. Escucha en tiempo real, así que
// apenas la Cloud Function resuelve el estado, esta pantalla avanza sola.
export default function RequireVerificacion({ children }) {
  const uid = getAuth().currentUser?.uid
  const [usuario, setUsuario] = useState(undefined) // undefined = cargando
  const [demasiadoLento, setDemasiadoLento] = useState(false)

  useEffect(() => {
    if (!uid) return
    const ref = doc(db, 'usuarios', uid)
    const desuscribir = onSnapshot(ref, (snap) => {
      setUsuario(snap.exists() ? snap.data() : null)
    })
    return () => desuscribir()
  }, [uid])

  const estado = usuario?.estadoVerificacion

  // Registra el evento justo en el instante en que pasa a "aprobado" — no
  // en cada carga de alguien que ya estaba aprobado de antes (por eso
  // exige haber visto un estado previo distinto dentro de este mismo
  // listener, no solo que el valor actual sea "aprobado").
  const estadoAnteriorRef = useRef(undefined)
  useEffect(() => {
    if (estado === 'aprobado' && estadoAnteriorRef.current && estadoAnteriorRef.current !== 'aprobado') {
      registrarEvento('verificacion_aprobada')
    }
    estadoAnteriorRef.current = estado
  }, [estado])

  // La Cloud Function a veces se queda sin tiempo con fotos muy pesadas y
  // el perfil queda trabado en "pendiente" para siempre. Si pasa más de un
  // minuto, dejamos de asumir que ya casi termina y le damos a la persona
  // una salida real en vez de un spinner infinito. Se reinicia si sube una
  // selfie nueva (nuevo intento).
  useEffect(() => {
    setDemasiadoLento(false)
    if (estado !== 'pendiente') return
    const temporizador = setTimeout(() => setDemasiadoLento(true), 60000)
    return () => clearTimeout(temporizador)
  }, [estado, usuario?.selfieActualizadaEn])

  if (usuario === undefined) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  if (estado === 'pendiente' && !demasiadoLento) {
    return (
      <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="radar" style={{ marginBottom: 20 }}>
          <div className="radar-core">🛡️</div>
        </div>
        <h1 style={{ marginBottom: 10 }}>Estamos revisando tu selfie</h1>
        <p>Esto no debería tardar más de un minuto. No hace falta que hagas nada.</p>
      </div>
    )
  }

  // Falta la foto de perfil: no es un rechazo de la selfie y no hay que
  // mandarla a sacarse otra. Se le dice qué falta y se la lleva a agregarla.
  if (estado === 'falta_foto') {
    return <FaltaFotoPerfil />
  }

  if (estado === 'rechazado' || estado === 'error_verificacion') {
    return <VerificacionRechazada uid={uid} />
  }

  if (estado === 'pendiente' && demasiadoLento) {
    return <VerificacionRechazada uid={uid} tardando />
  }

  return children
}

// Pantalla para quien completó el perfil sin foto. El problema no es su
// selfie, así que no se le pide otra: se le explica qué falta y se la manda a
// Perfil, donde puede agregarla tocando su avatar. Al guardarla, la propia
// escritura del documento vuelve a disparar la verificación.
function FaltaFotoPerfil() {
  const navigate = useNavigate()
  return (
    <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '2px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
          margin: '0 auto 20px',
        }}
      >
        <IconAlerta size={26} />
      </div>
      <h1 style={{ marginBottom: 10 }}>Te falta tu foto de perfil</h1>
      <p style={{ marginBottom: 24 }}>
        Comparamos tu selfie con tu foto de perfil para confirmar que eres tú, y todavía no tienes
        una. Agrégala y verificamos tu selfie enseguida.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/perfil')}>
        Agregar mi foto
      </button>
    </div>
  )
}

function VerificacionRechazada({ uid, tardando }) {
  const navigate = useNavigate()
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function manejarSelfie() {
    const blob = await elegirFoto({ source: CameraSource.Camera, direction: CameraDirection.Front })
    if (!blob) return
    setError('')
    setSubiendo(true)
    try {
      const selfieURL = await subirSelfieAlStorage(uid, blob)
      // La selfie va a la subcolección privada (dato biométrico); en el
      // documento público solo queda el estado y la marca de tiempo del
      // intento, que no dicen nada sensible.
      await guardarDatosPrivados(uid, { selfieVerificacion: selfieURL })
      await actualizarUsuario(uid, {
        selfieActualizadaEn: Date.now(),
        estadoVerificacion: 'pendiente',
      })
      // El onSnapshot de RequireVerificacion recibe el cambio solo y pasa a
      // la pantalla de espera.
    } catch (err) {
      setError(`No pudimos subir tu selfie. (${err?.code || err?.message || 'error desconocido'})`)
      setSubiendo(false)
    }
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          border: '2px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
          margin: '0 auto 20px',
        }}
      >
        {tardando ? <IconPendiente size={26} /> : <IconAlerta size={26} />}
      </div>
      <h1 style={{ marginBottom: 10 }}>
        {tardando ? 'Esto está tardando más de lo normal' : 'No pudimos verificar tu selfie'}
      </h1>
      <p style={{ marginBottom: tardando ? 20 : 10 }}>
        {tardando
          ? 'Puede haber sido un problema de conexión. Vuelve a tomarte la selfie para intentarlo de nuevo.'
          : 'Tu selfie no coincidió con tu foto de perfil, o no detectamos bien tu cara en alguna de las dos. Por tu seguridad y la de otros usuarios, necesitamos volver a verificarte.'}
      </p>
      {!tardando && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            lineHeight: 1.5,
            borderLeft: '2px solid var(--magenta)',
            borderRadius: 0,
            padding: '4px 0 4px 12px',
            margin: '0 0 20px',
            textAlign: 'left',
          }}
        >
          Mira de frente, con buena luz, y que se parezca a tu foto de perfil.
        </p>
      )}
      <label
        className="avatar-upload"
        style={{ margin: '0 auto 10px' }}
        onClick={subiendo ? undefined : manejarSelfie}
      >
        {subiendo ? (
          <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Subiendo...</span>
        ) : (
          <span style={{ fontSize: 24, color: 'var(--text-faint)' }}>📷</span>
        )}
      </label>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 20 }}>
        Toca el círculo para tomar tu selfie de nuevo
      </p>
      {error && (
        <p className="error-text" style={{ marginBottom: 8 }}>
          {error}
        </p>
      )}
      <div className="divider" style={{ width: '100%' }}>
        o
      </div>
      <p style={{ fontSize: 12.5, marginBottom: 12 }}>
        ¿Tu foto de perfil no se ve clara? Puede ser la causa.
      </p>
      <button
        className="btn btn-secondary"
        onClick={() => navigate('/perfil')}
        disabled={subiendo}
      >
        Cambiar mi foto de perfil
      </button>
      <p className="legal-note">Tu información siempre estará protegida.</p>
    </div>
  )
}
