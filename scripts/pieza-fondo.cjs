// Monta los textos de marca sobre las fotos de fondo generadas con IA.
//
//   node scripts/pieza-fondo.cjs
//
// Los fondos los genera Max (los prompts quedaron en la conversación) y van
// en Escritorio\AQUIMATCH\fondos. Acá solo se compone encima, que es donde
// conviene tener control exacto: colores de marca, alineación y textos sin
// errores de ortografía — que es justo lo que la IA hace mal.
//
// Cada foto pide una ubicación distinta del texto, según dónde tenga espacio
// vacío, y un tema distinto según si es clara u oscura. Poner siempre el
// texto en el mismo lugar es lo que hace que una pieza se vea "pegada".

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BASE = 'C:/Users/max_1/OneDrive/Escritorio/AQUIMATCH'
const FONDOS = path.join(BASE, 'fondos')
const SALIDA = path.join(BASE, 'rrss')
fs.mkdirSync(SALIDA, { recursive: true })

const L = 1080
const FUENTE = 'Segoe UI, Calibri, sans-serif'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TEMAS = {
  oscuro: { titulo: '#FFFFFF', bajada: '#D6CCE0', pie: '#A99DB5', velo: '#0D0D14', logo: '#FFFFFF' },
  claro: { titulo: '#17111F', bajada: '#463A52', pie: '#6B5C79', velo: '#FFFFFF', logo: '#17111F' },
}

function capaTexto(p) {
  const t = TEMAS[p.tema]
  const tamTitulo = p.tamTitulo || 72
  const salto = Math.round(tamTitulo * 1.16)
  const lineas = [...p.titulo, p.resalte]

  // Dónde arranca el bloque de texto y de qué lado se oscurece la foto.
  let x = 72
  let yInicio
  let velo
  if (p.posicion === 'abajo') {
    yInicio = L - 300 - (lineas.length - 1) * salto - p.bajada.length * 44
    velo = `<linearGradient id="velo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="35%" stop-color="${t.velo}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${t.velo}" stop-opacity="0.93"/></linearGradient>`
  } else if (p.posicion === 'arriba') {
    // yTitulo permite subir el bloque cuando la foto tiene algo importante en
    // el medio que no conviene tapar.
    yInicio = p.yTitulo || 250
    velo = `<linearGradient id="velo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.velo}" stop-opacity="0.90"/>
      <stop offset="70%" stop-color="${t.velo}" stop-opacity="0"/></linearGradient>`
  } else {
    yInicio = Math.round((L - (lineas.length - 1) * salto) / 2) - 40
    velo = `<linearGradient id="velo" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.velo}" stop-opacity="0.93"/>
      <stop offset="52%" stop-color="${t.velo}" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="${t.velo}" stop-opacity="0"/></linearGradient>`
  }

  const filas = lineas
    .map((texto, i) => {
      const esResalte = i === lineas.length - 1
      const fill = esResalte ? 'url(#marca)' : t.titulo
      return `<text x="${x}" y="${yInicio + i * salto}" font-family="${FUENTE}" font-weight="bold" font-size="${tamTitulo}" fill="${fill}">${esc(texto)}</text>`
    })
    .join('\n  ')

  const yBajada = yInicio + lineas.length * salto + 6
  const bajada = p.bajada
    .map(
      (texto, i) =>
        `<text x="${x}" y="${yBajada + i * 44}" font-family="${FUENTE}" font-size="30" fill="${t.bajada}">${esc(texto)}</text>`
    )
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}">
  <defs>
    <linearGradient id="marca" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF2D8E"/><stop offset="100%" stop-color="#B12DFF"/>
    </linearGradient>
    ${velo}
  </defs>
  <rect width="${L}" height="${L}" fill="url(#velo)"/>
  <text x="72" y="106" font-family="${FUENTE}" font-weight="bold" font-size="38" fill="${t.logo}">Aquí<tspan fill="#B12DFF">Match</tspan></text>
  ${filas}
  ${bajada}
  <text x="72" y="${L - 58}" font-family="${FUENTE}" font-size="24" fill="${t.pie}" letter-spacing="3">${esc(p.pie)}</text>
</svg>`
}

const PIEZAS = [
  {
    salida: '10-titular.png',
    fondo: 'bar-noche.png',
    posicion: 'izquierda',
    tema: 'oscuro',
    titulo: ['Conoce personas', 'que ya están'],
    resalte: 'donde tú estás.',
    bajada: ['A tres mesas, no a tres kilómetros.'],
    pie: 'MUY PRONTO',
  },
  {
    salida: '11-de-dia.png',
    fondo: 'cafe-dia.png',
    posicion: 'izquierda',
    tema: 'claro',
    titulo: ['No es solo', 'para la'],
    resalte: 'noche.',
    bajada: ['Un café, un almuerzo,', 'una tarde cualquiera.'],
    pie: 'MUY PRONTO',
  },
  {
    salida: '12-verificados.png',
    fondo: 'restobar.png',
    posicion: 'abajo',
    tema: 'oscuro',
    tamTitulo: 66,
    titulo: ['Personas reales,'],
    resalte: 'verificadas.',
    bajada: [
      'Cada perfil se verifica con una selfie.',
      'Y tu ubicación exacta nunca se comparte.',
    ],
    pie: 'SEGURIDAD',
  },
  {
    salida: '13-match.png',
    // Fondo con las pantallas de la app ya montadas dentro de los teléfonos;
    // lo genera scripts/pantallas-en-telefonos.cjs.
    fondo: 'mesas-telefonos-app.png',
    posicion: 'arriba',
    tema: 'oscuro',
    // Los dos teléfonos empiezan en y=413, así que el bloque de texto sube y
    // se achica para no pisarlos.
    tamTitulo: 60,
    yTitulo: 196,
    // El titular describe lo que se ve en la foto: dos desconocidos en mesas
    // distintas del mismo bar, cada uno mirando la ficha del otro. Antes decía
    // "se abre el chat", que no calzaba — en las pantallas todavía no hay chat.
    // Y se evita "Ella está", porque el titular le habla a cualquiera.
    titulo: ['Está a dos mesas.'],
    resalte: 'Y también te vio.',
    bajada: ['Los dos en el mismo bar,', 'sin haberse hablado todavía.'],
    pie: 'HAZ MATCH',
  },
]

;(async () => {
  for (const p of PIEZAS) {
    const ruta = path.join(FONDOS, p.fondo)
    if (!fs.existsSync(ruta)) {
      console.log(`  (falta ${p.fondo}, se omite ${p.salida})`)
      continue
    }
    const fondo = await sharp(ruta).resize(L, L, { fit: 'cover' }).toBuffer()
    await sharp(fondo)
      .composite([{ input: Buffer.from(capaTexto(p)) }])
      .png()
      .toFile(path.join(SALIDA, p.salida))
    console.log('  ' + p.salida)
  }
  console.log('\nEn:', SALIDA)
})()
