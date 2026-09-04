import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { obtenerConexion, obtenerPerfilBasico } from '../services/discover'

const COLORES_CONFETTI = ['#FF2D8E', '#B12DFF', '#6A00FF', '#FF87BE', '#FFD27A']

// Genera el destino al azar de cada partícula (ángulo + distancia desde el
// centro), una sola vez por aparición de la pantalla.
function generarConfetti(cantidad) {
  return Array.from({ length: cantidad }, (_, i) => {
    const angulo = Math.random() * Math.PI * 2
    const distancia = 90 + Math.random() * 150
    const tamano = 5 + Math.random() * 5
    return {
      id: i,
      tx: `${Math.cos(angulo) * distancia}px`,
      ty: `${Math.sin(angulo) * distancia}px`,
      rot: `${Math.round(Math.random() * 720 - 360)}deg`,
      color: COLORES_CONFETTI[i % COLORES_CONFETTI.length],
      delay: `${Math.random() * 0.12}s`,
      ancho: tamano,
      alto: tamano * (Math.random() > 0.5 ? 1 : 1.8),
    }
  })
}

export default function MutualMatch() {
  const { id } = useParams()
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid
  const [cargando, setCargando] = useState(true)
  const [miFoto, setMiFoto] = useState('')
  const [otroPerfil, setOtroPerfil] = useState(null)
  const confetti = useMemo(() => generarConfetti(32), [])

  // Vibración corta de celebración al entrar — no hace falta ningún plugin
  // nativo, el navegador ya la soporta dentro de la app empacada (para que
  // realmente vibre en Android hace falta el permiso VIBRATE en el manifest,
  // ya agregado). Si el dispositivo no la soporta, no pasa nada.
  useEffect(() => {
    navigator.vibrate?.([30, 60, 30, 60, 120])
  }, [])

  useEffect(() => {
    let activo = true
    async function cargar() {
      const conexion = await obtenerConexion(id)
      if (!conexion) {
        navigate('/activacion')
        return
      }
      const otroUid = conexion.usuarios.find((u) => u !== uid)
      const [miPerfil, perfilOtro] = await Promise.all([
        obtenerPerfilBasico(uid),
        obtenerPerfilBasico(otroUid),
      ])
      if (!activo) return
      setMiFoto(miPerfil?.fotoPrincipal || '')
      setOtroPerfil(perfilOtro)
      setCargando(false)
    }
    cargar()
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Un momento...</p>
      </div>
    )
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 220,
          height: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 22px',
        }}
      >
        {confetti.map((p) => (
          <span
            key={p.id}
            className="confetti-particula"
            style={{
              width: p.ancho,
              height: p.alto,
              background: p.color,
              '--tx': p.tx,
              '--ty': p.ty,
              '--rot': p.rot,
              animationDelay: p.delay,
            }}
          />
        ))}

        <div className="match-ring" style={{ width: 130, height: 130, margin: 'auto' }} />
        <div className="match-ring delay" style={{ width: 130, height: 130, margin: 'auto' }} />

        <div className="match-avatares" style={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
          <Avatar url={miFoto} />
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 -14px',
              zIndex: 2,
              fontSize: 18,
              boxShadow: '0 0 0 4px var(--bg)',
            }}
          >
            ✨
          </div>
          <Avatar url={otroPerfil?.fotoPrincipal} />
        </div>
      </div>

      <div
        className="match-linea"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.3em',
          color: 'var(--text-faint)',
          marginBottom: 14,
          animationDelay: '0.2s',
        }}
      >
        ES UN MATCH
      </div>

      <h1
        className="match-linea"
        style={{ fontSize: 27, lineHeight: 1.25, marginBottom: 14, animationDelay: '0.3s' }}
      >
        Todo
        <br />
        acaba de <span style={{ color: 'var(--magenta)' }}>cambiar</span>
      </h1>

      <p
        className="match-linea"
        style={{
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--text-dim)',
          marginBottom: 32,
          animationDelay: '0.4s',
        }}
      >
        Los dos decidieron
        <br />
        darse una oportunidad.
      </p>

      <div className="stack">
        <button
          className="btn btn-primary match-linea"
          style={{ animationDelay: '0.5s' }}
          onClick={() => navigate(`/chat/${id}`)}
        >
          Comenzar conversación
        </button>
        <button
          className="btn btn-ghost match-linea"
          style={{ animationDelay: '0.6s' }}
          onClick={() => navigate('/descubrir')}
        >
          Seguir descubriendo
        </button>
      </div>
    </div>
  )
}

function Avatar({ url }) {
  return (
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'var(--gradient)',
        border: '3px solid var(--bg)',
        boxShadow: '0 0 0 2px var(--border)',
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          className="foto-persona"
        />
      )}
    </div>
  )
}
