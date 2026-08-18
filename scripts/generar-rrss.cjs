// Genera las piezas cuadradas (1080x1080) para redes sociales.
//
//   node scripts/generar-rrss.cjs
//
// Salen en C:\Users\max_1\OneDrive\Escritorio\AQUIMATCH\rrss\
//
// Criterio de diseño: UNA idea por pieza. El afiche que había antes metía
// 150 palabras en una imagen, y en el feed de Instagram nadie lee eso —
// una publicación tiene uno o dos segundos de atención.
//
// La tipografía real de la marca es Poppins, pero el renderizador de este
// equipo no la encuentra y cae en una de reemplazo. Las piezas sirven como
// prototipo; para la versión final conviene rehacerlas con Poppins.

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SALIDA = 'C:/Users/max_1/OneDrive/Escritorio/AQUIMATCH/rrss'
const CAPTURAS = path.join(__dirname, '..', 'hosting-public', 'img')
fs.mkdirSync(SALIDA, { recursive: true })

const L = 1080 // lado
const FUENTE = 'Segoe UI, Calibri, sans-serif'

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Fondo común: negro de marca + resplandor magenta-violeta arriba a la derecha.
const fondo = (extra = '') => `
  <defs>
    <radialGradient id="glow" cx="72%" cy="18%" r="62%">
      <stop offset="0%" stop-color="#B12DFF" stop-opacity="0.30"/>
      <stop offset="45%" stop-color="#FF2D8E" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0D0D14" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="marca" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FF2D8E"/>
      <stop offset="50%" stop-color="#B12DFF"/>
      <stop offset="100%" stop-color="#6A00FF"/>
    </linearGradient>
    ${extra}
  </defs>
  <rect width="${L}" height="${L}" fill="#0D0D14"/>
  <rect width="${L}" height="${L}" fill="url(#glow)"/>`

// Logotipo chico, arriba a la izquierda.
const logo = (y = 96) => `
  <text x="80" y="${y}" font-family="${FUENTE}" font-weight="bold" font-size="40" fill="#F5F3F7">Aquí<tspan fill="#B12DFF">Match</tspan></text>`

const pie = (texto) => `
  <text x="80" y="${L - 70}" font-family="${FUENTE}" font-size="26" fill="#7C7089" letter-spacing="2">${esc(texto)}</text>`

// Texto en varias líneas, controlando el corte a mano (SVG no sabe envolver).
const lineas = (arr, { x, y, alto, tam, peso = 'bold', fill = '#F5F3F7' }) =>
  arr
    .map(
      (t, i) =>
        `<text x="${x}" y="${y + i * alto}" font-family="${FUENTE}" font-weight="${peso}" font-size="${tam}" fill="${fill}">${t}</text>`
    )
    .join('\n')

async function guardar(nombre, svg, capas = []) {
  let img = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}">${svg}</svg>`))
  if (capas.length) img = img.composite(capas)
  const destino = path.join(SALIDA, nombre)
  await img.png().toFile(destino)
  console.log('  ' + nombre)
}

;(async () => {
  // ---------- 1. Titular ----------
  await guardar(
    '01-titular.png',
    fondo() +
      logo() +
      lineas(['Conoce personas', 'que ya están'], { x: 80, y: 400, alto: 96, tam: 82 }) +
      `<text x="80" y="592" font-family="${FUENTE}" font-weight="bold" font-size="82" fill="url(#marca)">donde tú estás.</text>` +
      lineas(
        ['En un bar, café, restorán o pub.', 'A tres mesas, no a tres kilómetros.'],
        { x: 80, y: 700, alto: 46, tam: 32, peso: 'normal', fill: '#B3A6BF' }
      ) +
      pie('MUY PRONTO')
  )

  // ---------- 2 a 5. Cómo funciona ----------
  const pasos = [
    ['Llega al lugar', ['Entra a tu bar, café o', 'restorán favorito.']],
    ['Actívate ahí', ['Abre AquíMatch y activa tu', 'presencia. Solo funciona si', 'estás realmente en el lugar.']],
    ['Mira quién está', ['Ves a las personas que están', 'en ese mismo lugar,', 'en ese mismo momento.']],
    ['Si hay match, hablen', ['Cuando el interés es mutuo,', 'se abre el chat. Y está', 'a unos metros.']],
  ]
  for (let i = 0; i < pasos.length; i++) {
    const [titulo, cuerpo] = pasos[i]
    await guardar(
      `0${i + 2}-paso-${i + 1}.png`,
      fondo() +
        logo() +
        `<circle cx="130" cy="380" r="50" fill="url(#marca)"/>
         <text x="130" y="400" font-family="${FUENTE}" font-weight="bold" font-size="48" fill="#fff" text-anchor="middle">${i + 1}</text>` +
        `<text x="80" y="530" font-family="${FUENTE}" font-weight="bold" font-size="62" fill="#F5F3F7">${esc(titulo)}</text>` +
        lineas(cuerpo, { x: 80, y: 610, alto: 48, tam: 34, peso: 'normal', fill: '#B3A6BF' }) +
        pie(`PASO ${i + 1} DE 4`)
    )
  }

  // ---------- 6. Verificación (reemplaza el "100% segura") ----------
  await guardar(
    '06-verificacion.png',
    fondo() +
      logo() +
      `<text x="80" y="400" font-family="${FUENTE}" font-weight="bold" font-size="72" fill="#F5F3F7">Perfiles</text>` +
      `<text x="80" y="482" font-family="${FUENTE}" font-weight="bold" font-size="72" fill="url(#marca)">verificados.</text>` +
      lineas(
        [
          'Cada persona se toma una selfie',
          'que comparamos con su foto de',
          'perfil. Sin perfiles falsos.',
        ],
        { x: 80, y: 580, alto: 50, tam: 34, peso: 'normal', fill: '#B3A6BF' }
      ) +
      lineas(['Y tu ubicación exacta', 'nunca se comparte.'], {
        x: 80,
        y: 790,
        alto: 44,
        tam: 30,
        peso: 'normal',
        fill: '#7C7089',
      }) +
      pie('SEGURIDAD')
  )

  // ---------- 7 y 8. Capturas reales de la app ----------
  const conCaptura = [
    ['07-app-descubrir.png', 'descubrir.webp', 'Así se ve', 'Una persona a la vez,', 'de las que están ahí contigo.'],
    ['08-app-estado.png', 'estado.webp', 'Estás activo', 'Mientras estés en el lugar,', 'y solo mientras estés.'],
  ]
  for (const [nombre, archivo, titulo, l1, l2] of conCaptura) {
    const ancho = 300
    const base = await sharp(path.join(CAPTURAS, archivo)).resize({ width: ancho }).png().toBuffer()
    const meta = await sharp(base).metadata()
    // Esquinas redondeadas, para que se lea como la pantalla de un teléfono y
    // no como un recorte pegado encima.
    const mascara = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect width="${meta.width}" height="${meta.height}" rx="26" ry="26" fill="#fff"/></svg>`
    )
    const captura = await sharp(base)
      .composite([{ input: mascara, blend: 'dest-in' }])
      .png()
      .toBuffer()
    await guardar(
      nombre,
      fondo() +
        logo() +
        `<text x="80" y="330" font-family="${FUENTE}" font-weight="bold" font-size="60" fill="#F5F3F7">${esc(titulo)}</text>` +
        lineas([l1, l2], { x: 80, y: 410, alto: 44, tam: 30, peso: 'normal', fill: '#B3A6BF' }) +
        pie('MUY PRONTO'),
      [{ input: captura, top: Math.round((L - meta.height) / 2) + 60, left: L - ancho - 90 }]
    )
  }

  console.log('\nListas en:', SALIDA)
})()
