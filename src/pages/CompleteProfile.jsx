import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { actualizarUsuario } from '../firebase/auth'
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
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  async function manejarSelfie() {
    const blob = await elegirFoto({ source: CameraSource.Camera, direction: CameraDirection.Front })
    if (!blob) return
    setSelfie(blob)
    setSelfiePreview(URL.createObjectURL(blob))
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
    setCargando(true)
    try {
      const auth = getAuth()
      const uid = auth.currentUser.uid
      const selfieURL = await subirSelfieAlStorage(uid, selfie)
      await conLimiteDeTiempo(
        actualizarUsuario(uid, {
          preferenciaGenero: interes,
          intereses,
          selfieVerificacion: selfieURL,
          estadoVerificacion: 'pendiente', // se revisa en backend / moderación
          perfilCompleto: true,
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
      <button className="btn btn-primary" onClick={manejarFinalizar} disabled={cargando}>
        {cargando ? 'Guardando...' : 'Listo'}
      </button>
      <p className="legal-note">Tu información siempre estará protegida.</p>
    </div>
  )
}
