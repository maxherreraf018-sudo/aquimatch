import { useNavigate } from 'react-router-dom'
import { IconVolver } from '../components/Icons'
// Texto legal compartido con el sitio web — ver src/data/legal.js
import { POLITICA_PRIVACIDAD as SECCIONES, ULTIMA_ACTUALIZACION } from '../data/legal'

export default function Privacidad() {
  const navigate = useNavigate()

  return (
    <div className="screen">
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <IconVolver size={16} /> Volver
      </button>
      <h1 style={{ marginBottom: 4 }}>Política de Privacidad</h1>
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 20 }}>
        AquíMatch · Última actualización: {ULTIMA_ACTUALIZACION}
      </p>

      {SECCIONES.map((s) => (
        <div key={s.titulo} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>{s.titulo}</h2>
          {s.parrafos?.map((texto, i) => (
            <p key={i} style={{ marginBottom: 8, fontSize: 14 }}>
              {texto}
            </p>
          ))}
          {s.lista && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
              {s.lista.map((item, i) => (
                <li key={i} style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {s.final?.map((texto, i) => (
            <p key={i} style={{ marginBottom: 8, fontSize: 14 }}>
              {texto}
            </p>
          ))}
        </div>
      ))}

      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => navigate(-1)}>
        Volver
      </button>
    </div>
  )
}
