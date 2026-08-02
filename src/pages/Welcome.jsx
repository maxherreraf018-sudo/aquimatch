import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
export default function Welcome() {
  const navigate = useNavigate()
  return (
    <div className="screen">
      <div className="spacer" />
      <div style={{ textAlign: 'center' }}>
        <div className="radar" style={{ width: 130, height: 130, margin: '0 auto 20px' }}>
          <img
            src={logo}
            alt="AquíMatch"
            style={{
              position: 'relative',
              zIndex: 1,
              width: 96,
              height: 96,
              objectFit: 'contain',
              mixBlendMode: 'screen',
            }}
          />
        </div>
        <h1 style={{ marginBottom: 10 }}>
          Aquí<span style={{ color: 'var(--magenta)' }}>Match</span>
        </h1>
        <h2 style={{ fontWeight: 500, color: 'var(--text-dim)', fontSize: 18, marginBottom: 20 }}>
          Conecta en el mismo lugar.
        </h2>
        <p>Activa tu presencia y descubre personas que también están aquí.</p>
      </div>
      <div className="spacer" />
      <div className="stack">
        <button className="btn btn-primary" onClick={() => navigate('/auth')}>
          Comenzar
        </button>
        <p className="legal-note">Solo personas mayores de 18 años.</p>
      </div>
    </div>
  )
}
