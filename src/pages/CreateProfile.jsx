import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'
import { actualizarUsuario } from '../firebase/auth'
import { IconAgregar } from '../components/Icons'

const OPCIONES_GENERO = [
  { valor: 'mujer', etiqueta: 'Mujer' },
  { valor: 'hombre', etiqueta: 'Hombre' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const MESES = [
  { valor: '01', etiqueta: 'Enero' },
  { valor: '02', etiqueta: 'Febrero' },
  { valor: '03', etiqueta: 'Marzo' },
  { valor: '04', etiqueta: 'Abril' },
  { valor: '05', etiqueta: 'Mayo' },
  { valor: '06', etiqueta: 'Junio' },
  { valor: '07', etiqueta: 'Julio' },
  { valor: '08', etiqueta: 'Agosto' },
  { valor: '09', etiqueta: 'Septiembre' },
  { valor: '10', etiqueta: 'Octubre' },
  { valor: '11', etiqueta: 'Noviembre' },
  { valor: '12', etiqueta: 'Diciembre' },
]

const ANIO_ACTUAL = new Date().getFullYear()
const DIAS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))
const ANIOS = Array.from({ length: 90 }, (_, i) => String(ANIO_ACTUAL - i))

export default function CreateProfile() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [dia, setDia] = useState('')
  const [mes, setMes] = useState('')
  const [anio, setAnio] = useState('')
  const [genero, setGenero] = useState('')
  const [foto, setFoto] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  function manejarFoto(e) {
    const archivo = e.target.files[0]
    if (archivo) {
      setFoto(archivo)
      setFotoPreview(URL.createObjectURL(archivo))
    }
  }

  function calcularEdad(fecha) {
    const nacimiento = new Date(fecha)
    const hoy = new Date()
    let edad = hoy.getFullYear() - nacimiento.getFullYear()
    const m = hoy.getMonth() - nacimiento.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--
    return edad
  }

  async function manejarContinuar(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Ingresa tu nombre.')
    if (!dia || !mes || !anio) return setError('Ingresa tu fecha de nacimiento.')
    const fechaNacimiento = `${anio}-${mes}-${dia}`
    if (calcularEdad(fechaNacimiento) < 18) {
      return setError('AquiMatch es solo para personas mayores de 18 años.')
    }
    if (!genero) return setError('Selecciona con qué género te identificas.')
    setCargando(true)
    try {
      const auth = getAuth()
      const uid = auth.currentUser.uid
      let fotoURL = ''
      if (foto) {
        const storageRef = ref(storage, `fotos-perfil/${uid}/principal.jpg`)
        await uploadBytes(storageRef, foto)
        fotoURL = await getDownloadURL(storageRef)
      }
      await actualizarUsuario(uid, {
        nombre: nombre.trim(),
        fechaNacimiento,
        genero,
        fotoPrincipal: fotoURL,
      })
      navigate('/completar-perfil')
    } catch (err) {
      setError('No pudimos guardar tu perfil. Intenta nuevamente.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="screen">
      <div className="progress">
        <div className="progress-dot active" />
        <div className="progress-dot active" />
        <div className="progress-dot" />
        <div className="progress-dot" />
      </div>
      <h1 style={{ marginBottom: 6 }}>Cuéntanos de ti</h1>
      <p style={{ marginBottom: 20 }}>Solo te tomará 2 minutos.</p>
      <label className="avatar-upload">
        {fotoPreview ? (
          <img src={fotoPreview} alt="Foto principal" />
        ) : (
          <IconAgregar size={28} style={{ color: 'var(--text-faint)' }} />
        )}
        <input type="file" accept="image/*" onChange={manejarFoto} style={{ display: 'none' }} />
      </label>
      <p style={{ textAlign: 'center', fontSize: 13, marginBottom: 20 }}>Foto principal</p>
      <form onSubmit={manejarContinuar} className="stack">
        <div className="field">
          <label>Nombre</label>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div className="field">
          <label>Fecha de nacimiento</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="input"
              style={{ flex: 1 }}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            >
              <option value="">Día</option>
              {DIAS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: 1.4 }}
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            >
              <option value="">Mes</option>
              {MESES.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: 1.2 }}
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
            >
              <option value="">Año</option>
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Me identifico como</label>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: -2, marginBottom: 2 }}>
            Esto nos ayuda a mostrarte a las personas correctas.
          </p>
          <div className="chip-group">
            {OPCIONES_GENERO.map((op) => (
              <div
                key={op.valor}
                className={`chip ${genero === op.valor ? 'selected' : ''}`}
                onClick={() => setGenero(op.valor)}
              >
                {op.etiqueta}
              </div>
            ))}
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={cargando}>
          {cargando ? 'Guardando...' : 'Continuar'}
        </button>
      </form>
    </div>
  )
}
