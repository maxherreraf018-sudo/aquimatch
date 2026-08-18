// Arma una captura de la pantalla "Descubrir" con otra foto de perfil.
//
//   node scripts/ficha-descubrir.cjs <foto.png> <"Nombre, edad"> <salida.png>
//
// Parte de la captura real de la app (hosting-public/img/descubrir.webp) y le
// reemplaza solo la tarjeta: la foto, el nombre y los intereses. Todo lo demás
// —barra de estado, píldora de arriba, botones, menú de abajo— queda tal cual,
// que es lo que hace que se vea como la app de verdad y no como una maqueta.
//
// Las coordenadas de la tarjeta están medidas sobre la captura original, que
// mide 440x956. Si algún día cambia el diseño de Descubrir, hay que volver a
// medirlas.

const sharp = require('sharp')

const PLANTILLA = 'hosting-public/img/descubrir.webp'
const TARJETA = { x: 22, y: 127, ancho: 396, alto: 585, radio: 16 }
const FUENTE = 'Segoe UI, Calibri, sans-serif'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Fila de "chips" de intereses, con el ancho calculado a ojo según el largo
// del texto (el SVG no sabe medir texto).
function chips(textos, y) {
  let x = 16
  return textos
    .map((t) => {
      const ancho = 30 + t.length * 7.6
      const s = `<g><rect x="${x}" y="${y}" width="${ancho}" height="27" rx="13.5" fill="#FFFFFF" fill-opacity="0.16"/>
        <text x="${x + ancho / 2}" y="${y + 18}" font-family="${FUENTE}" font-size="13" fill="#F2EEF6" text-anchor="middle">${esc(t)}</text></g>`
      x += ancho + 9
      return s
    })
    .join('')
}

function capaTarjeta(nombre, intereses) {
  const { ancho: W, alto: H } = TARJETA
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="52%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>

  <!-- Barras de las fotos del perfil: la primera activa, el resto apagadas. -->
  <rect x="8" y="9" width="125" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.95"/>
  <rect x="138" y="9" width="122" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.3"/>
  <rect x="265" y="9" width="125" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.3"/>

  <text x="16" y="466" font-family="${FUENTE}" font-weight="bold" font-size="26" fill="#FFFFFF">${esc(nombre)}</text>

  <circle cx="21" cy="487" r="4" fill="#FF2D8E"/>
  <text x="31" y="492" font-family="${FUENTE}" font-size="14" fill="#E3DAEC">En este lugar</text>

  <rect x="16" y="512" width="159" height="28" rx="14" fill="#FFFFFF" fill-opacity="0.2"/>
  <text x="95" y="531" font-family="${FUENTE}" font-size="14" fill="#F2EEF6" text-anchor="middle">Compartir un trago</text>

  ${chips(intereses, 553)}
</svg>`
}

async function ficha(foto, nombre, intereses, salida) {
  const { x, y, ancho, alto, radio } = TARJETA

  // La foto se recorta desde arriba a propósito: en un retrato vertical la
  // cara queda en el tercio superior, y centrar el recorte la dejaría cortada.
  const recortada = await sharp(foto)
    .resize(ancho, alto, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()

  const mascara = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="${ancho}" height="${alto}" rx="${radio}" ry="${radio}" fill="#fff"/></svg>`
  )
  const tarjeta = await sharp(recortada)
    .composite([
      { input: Buffer.from(capaTarjeta(nombre, intereses)) },
      { input: mascara, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()

  // Sin .png(): el formato lo decide la extensión del archivo de salida, así
  // que la misma función sirve para las piezas (.png) y para la captura que
  // usa el sitio web (.webp).
  await sharp(PLANTILLA)
    .composite([{ input: tarjeta, left: x, top: y }])
    .toFile(salida)
  return salida
}

module.exports = { ficha }

if (require.main === module) {
  const [foto, nombre, salida] = process.argv.slice(2)
  ficha(foto, nombre || 'Matías, 32', ['Deportes', 'Música', 'Asado'], salida).then(console.log)
}
