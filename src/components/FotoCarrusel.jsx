import { useState } from 'react'

// Carrusel de fotos estilo "historia": barra segmentada arriba, y zonas
// invisibles a los costados para pasar a la foto anterior/siguiente. Se
// reinicia solo cuando el padre le cambia la prop `key` (por ejemplo, al
// pasar de una persona a otra en Descubrir).
export default function FotoCarrusel({ fotos, alto, children }) {
  const [indice, setIndice] = useState(0)
  const fotosValidas = (fotos || []).filter(Boolean)
  const actual = fotosValidas[indice] || null
  const hayVarias = fotosValidas.length > 1
  const hayAnterior = indice > 0
  const haySiguiente = indice < fotosValidas.length - 1

  function anterior(e) {
    e.stopPropagation()
    setIndice((i) => Math.max(i - 1, 0))
  }
  function siguiente(e) {
    e.stopPropagation()
    setIndice((i) => Math.min(i + 1, fotosValidas.length - 1))
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: alto, overflow: 'hidden', background: 'var(--bg-card)' }}>
      {actual && (
        <img
          src={actual}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Sombra suave arriba. Sin esto, las barritas blancas desaparecen
          sobre una foto clara (un cielo, una pared blanca) y la persona no
          se entera de que hay más fotos. */}
      {hayVarias && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            background: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      {hayVarias && (
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 4, zIndex: 3, pointerEvents: 'none' }}>
          {fotosValidas.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i === indice ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </div>
      )}

      {hayVarias && (
        <>
          <div onClick={anterior} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', zIndex: 2 }} />
          <div onClick={siguiente} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%', zIndex: 2 }} />

          {/* Flechas al medio de cada costado. Las barras de arriba dicen que
              hay más fotos, pero no que se pasan tocando: sin una flecha a la
              vista, la zona invisible del costado no la descubre nadie.
              No reciben el toque ellas mismas — lo maneja la zona de abajo. */}
          {hayAnterior && <Flecha lado="izquierda" />}
          {haySiguiente && <Flecha lado="derecha" />}
        </>
      )}

      {children}
    </div>
  )
}

function Flecha({ lado }) {
  const esIzquierda = lado === 'izquierda'
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [esIzquierda ? 'left' : 'right']: 10,
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {esIzquierda ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </div>
  )
}
