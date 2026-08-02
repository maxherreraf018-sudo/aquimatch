import { useState } from 'react'

// Carrusel de fotos estilo "historia": barra segmentada arriba, y zonas
// invisibles a los costados para pasar a la foto anterior/siguiente. Se
// reinicia solo cuando el padre le cambia la prop `key` (por ejemplo, al
// pasar de una persona a otra en Descubrir).
export default function FotoCarrusel({ fotos, alto, children }) {
  const [indice, setIndice] = useState(0)
  const fotosValidas = (fotos || []).filter(Boolean)
  const actual = fotosValidas[indice] || null

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
      {fotosValidas.length > 1 && (
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 4, zIndex: 2 }}>
          {fotosValidas.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i === indice ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </div>
      )}
      {fotosValidas.length > 1 && (
        <>
          <div onClick={anterior} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', zIndex: 2 }} />
          <div onClick={siguiente} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%', zIndex: 2 }} />
        </>
      )}
      {children}
    </div>
  )
}
