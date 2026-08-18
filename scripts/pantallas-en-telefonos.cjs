// Mete capturas reales de la app dentro de los teléfonos de la foto de fondo.
//
//   node scripts/pantallas-en-telefonos.cjs
//
// Los teléfonos de la foto están inclinados, así que no alcanza con pegar un
// rectángulo encima: hay que deformar la captura con la misma perspectiva que
// tiene el teléfono. Eso es una homografía — la transformación que lleva las
// 4 esquinas de la captura a las 4 esquinas de la pantalla en la foto.
//
// El segundo problema es que los dedos pasan POR DELANTE de la pantalla. En
// vez de recortar las manos a mano (imposible de hacer bien), se aprovecha que
// la pantalla apagada es casi negra y la piel iluminada es clara: donde el
// píxel original es claro, se deja el original; donde es oscuro, entra la
// captura. Así los dedos, el marco metálico y los reflejos quedan encima solos.

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BASE = 'C:/Users/max_1/OneDrive/Escritorio/AQUIMATCH'
const L = 1080

const FOTO = 'mesas-telefonos.png'

// Esquinas de cada pantalla en el lienzo de 1080x1080, medidas sobre la foto.
// Orden: arriba-izq, arriba-der, abajo-der, abajo-izq.
//
// La forma de saber si están bien medidas: el cuadrilátero tiene que dar una
// proporción cercana a 2,17, que es la de una pantalla de teléfono real
// (19,5:9). Si da mucho menos, es que se quedó corto — normalmente porque una
// punta del teléfono está tapada por los dedos y no se ve dónde termina.
const TELEFONOS = [
  {
    nombre: 'izquierdo', // mano de hombre, reloj de metal
    esquinas: [
      [321, 413],
      [444, 434],
      [414, 701],
      [277, 676],
    ],
  },
  {
    nombre: 'derecho', // mano de mujer, esmalte oscuro y anillo
    esquinas: [
      [725, 485],
      [849, 480],
      [864, 762],
      [741, 768],
    ],
  },
]

// Umbrales de luminancia para decidir qué queda por delante. Por debajo de
// BAJO es pantalla apagada (entra la captura); por encima de ALTO es dedo,
// marco o reflejo (se respeta el original). En el medio se mezcla, que es lo
// que evita el borde recortado.
const LUM_BAJO = 0.1
const LUM_ALTO = 0.3

// ---------------------------------------------------------------------------
// Homografía
// ---------------------------------------------------------------------------

// Resuelve un sistema lineal n x n por eliminación gaussiana con pivoteo.
function resolver(A, b) {
  const n = b.length
  for (let i = 0; i < n; i++) {
    let mejor = i
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[mejor][i])) mejor = r
    ;[A[i], A[mejor]] = [A[mejor], A[i]]
    ;[b[i], b[mejor]] = [b[mejor], b[i]]
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i]
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]
      b[r] -= f * b[i]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]
    x[i] = s / A[i][i]
  }
  return x
}

// Matriz que lleva los 4 puntos `desde` a los 4 puntos `hasta`.
// Se calcula en el sentido lienzo -> captura, porque el recorrido se hace
// pixel por pixel sobre el lienzo y para cada uno hay que saber de dónde sale.
function homografia(desde, hasta) {
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = desde[i]
    const [u, v] = hasta[i]
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v])
    b.push(v)
  }
  const h = resolver(A, b)
  return (x, y) => {
    const d = h[6] * x + h[7] * y + 1
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]
  }
}

// ---------------------------------------------------------------------------

function muestrear(px, w, h, x, y) {
  // Bilineal, con los bordes recortados para que no se vea una franja rara.
  const x0 = Math.min(w - 1, Math.max(0, Math.floor(x)))
  const y0 = Math.min(h - 1, Math.max(0, Math.floor(y)))
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = Math.min(1, Math.max(0, x - x0))
  const fy = Math.min(1, Math.max(0, y - y0))
  const out = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const a = px[(y0 * w + x0) * 3 + c] * (1 - fx) + px[(y0 * w + x1) * 3 + c] * fx
    const d = px[(y1 * w + x0) * 3 + c] * (1 - fx) + px[(y1 * w + x1) * 3 + c] * fx
    out[c] = a * (1 - fy) + d * fy
  }
  return out
}

async function montar(fondoRaw, captura, esquinas) {
  const { data: cap, info } = await sharp(captura)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const cw = info.width
  const ch = info.height

  const aCaptura = homografia(esquinas, [
    [0, 0],
    [cw, 0],
    [cw, ch],
    [0, ch],
  ])

  const xs = esquinas.map((p) => p[0])
  const ys = esquinas.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2)
  const x1 = Math.min(L - 1, Math.ceil(Math.max(...xs)) + 2)
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2)
  const y1 = Math.min(L - 1, Math.ceil(Math.max(...ys)) + 2)

  // 3x3 sub-muestras por píxel: sin esto el borde de la pantalla queda
  // dentado, y un borde dentado delata el montaje al instante.
  const N = 3
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let dentro = 0
      const suma = [0, 0, 0]
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const [u, v] = aCaptura(x + (sx + 0.5) / N, y + (sy + 0.5) / N)
          if (u < 0 || v < 0 || u >= cw || v >= ch) continue
          const c = muestrear(cap, cw, ch, u, v)
          suma[0] += c[0]
          suma[1] += c[1]
          suma[2] += c[2]
          dentro++
        }
      }
      if (!dentro) continue

      const i = (y * L + x) * 3
      const r = fondoRaw[i]
      const g = fondoRaw[i + 1]
      const b = fondoRaw[i + 2]
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      // 1 donde el original es oscuro (pantalla), 0 donde es claro (dedo/marco).
      const visible = Math.min(1, Math.max(0, (LUM_ALTO - lum) / (LUM_ALTO - LUM_BAJO)))
      const alfa = (dentro / (N * N)) * visible
      if (alfa <= 0) continue

      // La pantalla encendida es lo que más ilumina en una escena oscura, así
      // que se suma parte del original en vez de reemplazarlo del todo: eso
      // conserva los reflejos y el brillo del vidrio.
      for (let c = 0; c < 3; c++) {
        const pantalla = Math.min(255, suma[c] / dentro + fondoRaw[i + c] * 0.35)
        fondoRaw[i + c] = Math.round(fondoRaw[i + c] * (1 - alfa) + pantalla * alfa)
      }
    }
  }
}

module.exports = { montar, TELEFONOS, L }

if (require.main === module) {
  ;(async () => {
    const capturas = process.argv.slice(2)
    if (capturas.length !== 2) {
      console.log('uso: node scripts/pantallas-en-telefonos.cjs <captura-izq> <captura-der>')
      process.exit(1)
    }
    const { data } = await sharp(path.join(BASE, 'fondos', FOTO))
      .resize(L, L, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    for (let i = 0; i < 2; i++) await montar(data, capturas[i], TELEFONOS[i].esquinas)

    // Se guarda como un fondo más, para que pieza-fondo.cjs le monte el texto
    // encima igual que a las otras fotos.
    const salida = path.join(BASE, 'fondos', FOTO.replace('.png', '-app.png'))
    fs.mkdirSync(path.dirname(salida), { recursive: true })
    await sharp(data, { raw: { width: L, height: L, channels: 3 } }).png().toFile(salida)
    console.log(salida)
  })()
}
