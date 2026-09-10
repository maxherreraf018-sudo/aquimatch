// Genera las láminas de redes sociales de AquíMatch a 1080x1080.
//
// 1080x1080 y no 1080x1350 a propósito: todo lo que ya está publicado y todo el
// banco de imágenes de rrss/ es cuadrado, y mezclar proporciones dentro de un
// mismo perfil se nota en la grilla.
//
// La tipografía de la marca es Poppins, que NO está instalada en esta máquina.
// Se usa Century Gothic, que es la geométrica más cercana que hay en Windows
// (misma 'a' de un piso, mismas 'o' circulares). Si alguna vez se instala
// Poppins, basta con cambiar FUENTE y volver a correr esto.

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

// Se corre desde la raíz del proyecto:
//   node herramientas/generar-laminas-rrss.mjs
//
// sharp ya viene con las dependencias del proyecto, así que no hay que instalar
// nada. Para hacer una publicación nueva, agregar entradas a `laminas` de más
// abajo y volver a correrlo: las que ya existen se sobreescriben iguales.

const FUENTE = 'Century Gothic'
const SALIDA = 'C:/Users/max_1/OneDrive/Escritorio/AQUIMATCH/rrss'

const FONDO = '#0D0D14'
const TEXTO = '#f5f3f7'
const TENUE = '#b3a6bf'
const APAGADO = '#7a6d87'

function escapar(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Una lámina. `titulo` es una lista de líneas; cada una puede llevar acento:true
// para salir en el degradado de la marca.
function lamina({ kicker = null, titulo = [], sub = [], pie = null, tamTitulo = 76 }) {
  const alto = 1080
  const margen = 80
  const interlineado = Math.round(tamTitulo * 1.22)
  const altoTitulo = titulo.length * interlineado
  const altoSub = sub.length * 46
  const altoBloque = altoTitulo + (sub.length ? 46 + altoSub : 0)
  let y = Math.round((alto - altoBloque) / 2) + Math.round(tamTitulo * 0.75)

  const lineasTitulo = titulo
    .map((linea) => {
      const texto = typeof linea === 'string' ? linea : linea.texto
      const acento = typeof linea === 'string' ? false : linea.acento
      const t = `<text x="${margen}" y="${y}" font-family="${FUENTE}" font-size="${tamTitulo}" font-weight="700" fill="${acento ? 'url(#marca)' : TEXTO}">${escapar(texto)}</text>`
      y += interlineado
      return t
    })
    .join('')

  let ySub = y + 30
  const lineasSub = sub
    .map((texto) => {
      const t = `<text x="${margen}" y="${ySub}" font-family="${FUENTE}" font-size="30" fill="${TENUE}">${escapar(texto)}</text>`
      ySub += 46
      return t
    })
    .join('')

  const kickerSvg = kicker
    ? `<text x="${margen}" y="200" font-family="${FUENTE}" font-size="24" font-weight="700" letter-spacing="6" fill="${'#FF2D8E'}">${escapar(kicker.toUpperCase())}</text>`
    : ''

  const pieSvg = pie
    ? `<text x="${margen}" y="1005" font-family="${FUENTE}" font-size="24" letter-spacing="5" fill="${APAGADO}">${escapar(pie.toUpperCase())}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="marca" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0%" stop-color="#FF2D8E"/>
      <stop offset="55%" stop-color="#B12DFF"/>
      <stop offset="100%" stop-color="#6A00FF"/>
    </linearGradient>
    <radialGradient id="brilloVioleta" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#6A00FF" stop-opacity="0.42"/>
      <stop offset="60%" stop-color="#6A00FF" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#6A00FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="brilloMagenta" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#FF2D8E" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#FF2D8E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="${FONDO}"/>
  <ellipse cx="790" cy="200" rx="420" ry="380" fill="url(#brilloVioleta)"/>
  <ellipse cx="180" cy="960" rx="360" ry="300" fill="url(#brilloMagenta)"/>
  <text x="${margen}" y="98" font-family="${FUENTE}" font-size="40" font-weight="700" fill="${TEXTO}">Aquí<tspan fill="url(#marca)">Match</tspan></text>
  ${kickerSvg}
  ${lineasTitulo}
  ${lineasSub}
  ${pieSvg}
</svg>`
}

const laminas = [
  // ---- Publicación 2: cómo funciona ----
  ['p2-1-la-viste', { titulo: [{ texto: 'La viste' }, { texto: 'en la barra.' }, { texto: 'No pasó nada.', acento: true }], sub: ['Otra vez.'], pie: 'desliza →' }],
  ['p2-2-activas', { kicker: 'paso 1', titulo: [{ texto: 'Llegas al bar' }, { texto: 'y activas' }, { texto: 'AquíMatch.', acento: true }], sub: ['El GPS confirma que estás ahí.', 'Sin eso, no entras.'], pie: 'desliza →' }],
  ['p2-3-quien-se-ve', { kicker: 'paso 2', titulo: [{ texto: 'No ves a todo' }, { texto: 'el bar. Ves a' }, { texto: 'quienes también' }, { texto: 'quieren conocer', acento: true }, { texto: 'a alguien.', acento: true }], sub: ['Solo apareces si tú lo decides.'], pie: 'desliza →', tamTitulo: 68 }],
  ['p2-4-el-chat', { kicker: 'paso 3', titulo: [{ texto: 'Si a los dos' }, { texto: 'les interesa,' }, { texto: 'se abre el chat.', acento: true }], sub: ['Si no, nadie se entera de nada.'], pie: 'desliza →' }],
  ['p2-5-desapareces', { kicker: 'paso 4', titulo: [{ texto: 'Sales del local' }, { texto: 'y desapareces.', acento: true }], sub: ['No guardamos dónde estuviste.', 'Ese historial vive solo en tu teléfono.'], pie: 'ya en android' }],

  // ---- Publicación 3: lo que no hacemos ----
  ['p3-1-nunca', { titulo: [{ texto: 'Hay cosas que' }, { texto: 'no vamos a' }, { texto: 'hacer nunca.', acento: true }], sub: ['Aunque den plata.'], pie: 'desliza →' }],
  ['p3-2-historial', { kicker: 'uno', titulo: [{ texto: 'No guardamos' }, { texto: 'dónde estuviste.', acento: true }], sub: ['Tu historial de lugares vive solo en tu', 'teléfono. Nosotros no lo tenemos.'], pie: 'desliza →' }],
  ['p3-3-seguridad', { kicker: 'dos', titulo: [{ texto: 'No cobramos por' }, { texto: 'bloquear ni', acento: true }, { texto: 'denunciar.', acento: true }], sub: ['La seguridad no es una función premium.'], pie: 'desliza →' }],
  ['p3-4-cerca', { kicker: 'tres', titulo: [{ texto: 'No te mostramos' }, { texto: 'gente que no' }, { texto: 'está aquí.', acento: true }], sub: ['Nada de perfiles a cinco kilómetros.', 'Solo quienes están donde tú estás, ahora.'], pie: 'ya en android' }],

  // ---- Publicación 4: para dueños de locales ----
  ['p4-1-tu-local', { titulo: [{ texto: 'Tu local ya' }, { texto: 'tiene la gente.' }, { texto: 'Le falta que', acento: true }, { texto: 'se hablen.', acento: true }], sub: [], pie: 'para dueños de locales', tamTitulo: 72 }],
  ['p4-2-cuarenta', { titulo: [{ texto: 'Un viernes hay' }, { texto: '40 personas', acento: true }, { texto: 'en tu bar.' }], sub: ['Varias vinieron a conocer a alguien.', 'Casi ninguna se va a atrever.'], pie: 'desliza →' }],
  ['p4-3-la-excusa', { titulo: [{ texto: 'AquíMatch les' }, { texto: 'da la excusa.', acento: true }], sub: ['Se activan estando en tu local.', 'Se ven entre ellos. Se hablan.', 'Y se quedan más rato.'], pie: 'desliza →' }],
  ['p4-4-el-panel', { titulo: [{ texto: 'Y tú ves' }, { texto: 'cómo va.', acento: true }], sub: ['Cuánta gente hay ahora, a qué hora llegan,', 'qué edades. Todo anónimo: nunca sabes', 'quién es quién, y así tiene que ser.'], pie: 'desliza →' }],
  ['p4-5-piloto', { titulo: [{ texto: 'Piloto gratis' }, { texto: '60 días.', acento: true }], sub: ['Sin instalar nada. Sin compromiso.', 'aquimatch.cl/locales'], pie: 'aquimatch spa · santiago' }],
]

await mkdir(SALIDA, { recursive: true })
for (const [nombre, config] of laminas) {
  const ruta = `${SALIDA}/${nombre}.png`
  await sharp(Buffer.from(lamina(config))).png().toFile(ruta)
  console.log('✓', nombre)
}
console.log(`\n${laminas.length} láminas en ${SALIDA}`)
