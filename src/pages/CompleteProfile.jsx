import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { actualizarUsuario, guardarDatosPrivados } from '../firebase/auth'
import { serverTimestamp } from 'firebase/firestore'
import { conLimiteDeTiempo, subirSelfieAlStorage } from '../services/verificacion'
import { elegirFoto, CameraSource, CameraDirection } from '../services/fotos'
import { OPCIONES_INTERES, MAX_INTERESES } from '../data/intereses'
import { IconCamara } from '../components/Icons'
const OPCIONES_INTERES_GENERO = [
  { valor: 'mujeres', etiqueta: 'Mujeres' },
  { valor: 'hombres', etiqueta: 'Hombres' },
  { valor: 'ambos', etiqueta: 'Ambos' },
]

export default function CompleteProfile() {
  const navigate = useNavigate()
  const [interes, setInteres] = useState('ambos')
  const [intereses, setIntereses] = useState([])
  const [selfie, setSelfie] = useState(null)
  const [selfiePreview, setSelfiePreview] = useState(null)
  const [aceptaDatosSensibles, setAceptaDatosSensibles] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function manejarSelfie() {
    try {
      const blob = await elegirFoto({ source: CameraSource.Camera, direction: CameraDirection.Front })
      if (!blob) return
      setError('')
      setSelfie(blob)
      setSelfiePreview(URL.createObjectURL(blob))
    } catch (err) {
      setError(`No pudimos abrir la cámara. (${err?.code || err?.message || 'error desconocido'})`)
    }
  }
  function manejarToggleInteres(valor) {
    setIntereses((prev) => {
      if (prev.includes(valor)) return prev.filter((v) => v !== valor)
      if (prev.length >= MAX_INTERESES) return prev
      return [...prev, valor]
    })
  }
  async function manejarFinalizar() {
    setError('')
    if (!selfie) return setError('Toma tu selfie de verificación para continuar.')
    if (!aceptaDatosSensibles) {
      return setError('Debes aceptar el tratamiento de tu selfie y tu preferencia de búsqueda para continuar.')
    }
    setCargando(true)
    try {
      const auth = getAuth()
      const uid = auth.currentUser.uid
      const selfieURL = await subirSelfieAlStorage(uid, selfie)
      // La selfie es un dato biométrico: va a la subcolección privada, que
      // solo pueden leer su dueño y el panel de moderación. Nunca al
      // documento público, que es legible por cualquiera con tu uid.
      await conLimiteDeTiempo(
        guardarDatosPrivados(uid, { selfieVerificacion: selfieURL }),
        25,
        'guardarDatosPrivados'
      )
      await conLimiteDeTiempo(
        actualizarUsuario(uid, {
          preferenciaGenero: interes,
          intereses,
          // Marca de tiempo del último intento, para que las pantallas que
          // esperan la revisión sepan que hubo una selfie nueva sin
          // necesidad de leer la selfie misma.
          selfieActualizadaEn: Date.now(),
          estadoVerificacion: 'pendiente', // se revisa en backend / moderación
          perfilCompleto: true,
          // Registro del consentimiento expreso para datos sensibles (selfie
          // biométrica + preferencia de género), separado de la aceptación
          // general de los Términos — exigido por la Ley 21.719. Queda con
          // fecha/hora exacta por si hace falta acreditarlo.
          consentimientoDatosSensiblesEn: serverTimestamp(),
        }),
        25,
        'actualizarUsuario'
      )
      navigate('/activacion')
    } catch (err) {
      setError(`No pudimos guardar tu selfie. (${err?.code || err?.message || 'error desconocido'})`)
    } finally {
      setCargando(false)
    }
  }
  return (
    <div className="screen">
      <div className="progress">
        <div className="progress-dot active" />
        <div className="progress-dot active" />
        <div className="progress-dot active" />
        <div className="progress-dot active" />
      </div>
      <h1 style={{ marginBottom: 6 }}>Últimos detalles</h1>
      <p style={{ marginBottom: 20 }}>Así te mostraremos a las personas que te interesan.</p>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Me gustaría conocer</label>
        <div className="chip-group">
          {OPCIONES_INTERES_GENERO.map((op) => (
            <div
              key={op.valor}
              className={`chip ${interes === op.valor ? 'selected' : ''}`}
              onClick={() => setInteres(op.valor)}
            >
              {op.etiqueta}
            </div>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Tus intereses</label>
        <p style={{ fontSize: 12.5, marginBottom: 10 }}>
          Elige hasta {MAX_INTERESES}. Llevas {intereses.length} de {MAX_INTERESES}.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {OPCIONES_INTERES.map((op) => (
            <div
              key={op.valor}
              className={`chip ${intereses.includes(op.valor) ? 'selected' : ''}`}
              style={{ flex: '0 0 auto' }}
              onClick={() => manejarToggleInteres(op.valor)}
            >
              {op.emoji} {op.etiqueta}
            </div>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Selfie de verificación</label>
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          Tómate un selfie para verificar que eres tú.
        </p>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            lineHeight: 1.5,
            borderLeft: '2px solid var(--magenta)',
            borderRadius: 0,
            padding: '4px 0 4px 12px',
            margin: '10px 0 0',
          }}
        >
          Mira de frente, con buena luz, y que se parezca a tu foto de perfil.
        </p>
      </div>
      <label className="avatar-upload" onClick={manejarSelfie}>
        {selfiePreview ? (
          <img src={selfiePreview} alt="Selfie" />
        ) : (
          <IconCamara size={24} style={{ color: 'var(--text-faint)' }} />
        )}
      </label>
      {error && (
        <p className="error-text" style={{ textAlign: 'center', marginTop: 12 }}>
          {error}
        </p>
      )}
      <div className="spacer" />
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 9,
          padding: 12,
          borderRadius: 12,
          background: 'rgba(255, 45, 142, 0.06)',
          border: '1px solid rgba(255, 45, 142, 0.25)',
          marginBottom: 16,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={aceptaDatosSensibles}
          onChange={(e) => setAceptaDatosSensibles(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, width: 15, height: 15 }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>
          Acepto que mi <span style={{ color: 'var(--text)' }}>selfie de verificación</span> (dato biométrico) y mi{' '}
          <span style={{ color: 'var(--text)' }}>preferencia de personas que quiero conocer</span> se traten según se
          describe en la{' '}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="link">
            Política de Privacidad
          </a>
          .
        </span>
      </label>
      <button className="btn btn-primary" onClick={manejarFinalizar} disabled={cargando || !aceptaDatosSensibles}>
        {cargando ? 'Guardando...' : 'Listo'}
      </button>
      <p className="legal-note">Tu información siempre estará protegida.</p>
    </div>
  )
}
