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

// NADA DE LO QUE SE ESCRIBA ACÁ PUEDE SER UNA PROMESA QUE EL CÓDIGO NO CUMPLA.
//
// La primera versión de estas láminas decía "no guardamos dónde estuviste,
// nosotros no lo tenemos". Es falso, y se comprobó abriendo el código: los
// documentos de /intereses y /pases se llaman `placeId_desde_hacia` y llevan
// fecha, /conexiones guarda placeId y fecha, y /activaciones conserva placeId,
// placeName e iniciadaEn después de que la persona se va. Lo que sí vive solo
// en el teléfono es la lista de "mis lugares" (ver src/services/misLugares.js),
// que es una comodidad, no todo el registro.
//
// La diferencia entre esas dos frases es la diferencia entre una promesa de
// privacidad y una declaración falsa. Con la Ley 21.719 encima y la apelación
// de Apple abierta, publicar la segunda sería el error más caro posible.
//
// Regla para las próximas: si una lámina afirma algo sobre lo que hace o no
// hace el sistema, hay que poder abrir el archivo que lo cumple ANTES de
// generarla. Si no se puede, la frase no va.
const laminas = [
  // ---- Publicación 2: cómo funciona ----
  //
  // El gancho ya no es "la viste en la barra". No por suavizar: esa frase le
  // habla en masculino a un hombre ("la"), y las mujeres son el lado escaso de
  // esta app. Un gancho que le habla a la mitad del público cuesta más que lo
  // que rinde.
  ['p2-1-se-miraron', { titulo: [{ texto: 'Se miraron' }, { texto: 'dos veces. Y cada' }, { texto: 'uno se fue por', acento: true }, { texto: 'su lado.', acento: true }], sub: ['Pasa todos los viernes.'], pie: 'desliza →', tamTitulo: 68 }],
  // "Verificamos tu ubicación cerca del local", no "el GPS confirma que estás
  // ahí": activarEnLugar mide 120 metros contra las coordenadas del local, o
  // sea que comprueba cercanía. Alguien en la vereda o en el departamento de
  // arriba también pasa. La frase vieja prometía más de lo que se mide.
  ['p2-2-activas', { kicker: 'paso 1', titulo: [{ texto: 'Llegas al bar' }, { texto: 'y activas' }, { texto: 'AquíMatch.', acento: true }], sub: ['Verificamos tu ubicación cerca del local.'], pie: 'desliza →' }],
  ['p2-3-quien-se-ve', { kicker: 'paso 2', titulo: [{ texto: 'No ves a todo' }, { texto: 'el bar. Ves a' }, { texto: 'quienes también' }, { texto: 'quieren conocer', acento: true }, { texto: 'a alguien.', acento: true }], sub: ['Nadie aparece por estar en el bar.', 'Hay que activarse a propósito.'], pie: 'desliza →', tamTitulo: 68 }],
  // Sin subtítulo. Decía "si no, nadie se entera de nada", y es falso: la
  // regla de lectura de /intereses deja que quien RECIBE un "me interesa" lo
  // lea aunque no lo haya correspondido, así que con un cliente modificado se
  // puede saber. Hasta cerrar eso, la lámina dice solo lo que sí se cumple:
  // sin interés de los dos no hay chat.
  ['p2-4-el-chat', { kicker: 'paso 3', titulo: [{ texto: 'Si a los dos' }, { texto: 'les interesa,' }, { texto: 'se abre el chat.', acento: true }], sub: [], pie: 'desliza →' }],
  // "Salir desactiva tu participación", sin prometer que sea inmediato: la
  // escritura depende de que la solicitud llegue. Y si alguien se va sin tocar
  // "Salir", la activación se apaga cuando la app detecta que se alejó (solo
  // con la app abierta) o al pasar el umbral de inactividad.
  ['p2-5-tocas-salir', { kicker: 'paso 4', titulo: [{ texto: 'Te vas y' }, { texto: 'tocas Salir.', acento: true }], sub: ['Eso desactiva tu participación. Si se te', 'olvida, se desactiva sola cuando la app', 'nota que te alejaste, o tras unas horas.'], pie: 'desliza →' }],
  // La lámina que faltaba: sin gente en el mismo local la app no tiene nada que
  // mostrar. Decirlo antes evita que una pantalla vacía se lea como una app
  // rota. Y cierra con la acción concreta: descargar e invitar.
  ['p2-6-recien-partimos', { titulo: [{ texto: 'Recién' }, { texto: 'partimos.', acento: true }], sub: ['Descárgala en Android desde el link de', 'la bio, y si todavía no hay nadie, invita', 'a tus amigos a activarse en el mismo local.'], pie: 'solo mayores de 18 · ya en android' }],

  // ---- Publicación 3: EN PAUSA ----
  //
  // Era la de privacidad. Se saca entera hasta poder verificar, frase por
  // frase, qué se guarda y qué no. Ver el comentario de arriba.

  // ---- Publicación 4: para dueños de locales ----
  ['p4-1-tu-local', { titulo: [{ texto: 'Tu local ya' }, { texto: 'tiene la gente.' }, { texto: 'Le falta que', acento: true }, { texto: 'se hablen.', acento: true }], sub: [], pie: 'para dueños de locales', tamTitulo: 72 }],
  ['p4-2-cuarenta', { titulo: [{ texto: 'Un viernes hay' }, { texto: '40 personas', acento: true }, { texto: 'en tu bar.' }], sub: ['Varias vinieron a conocer a alguien.', 'Casi ninguna se va a atrever.'], pie: 'desliza →' }],
  // Se cayó "y se quedan más rato": es una hipótesis del negocio, no un
  // resultado medido. Prometérsela a un dueño en la primera publicación es
  // exactamente lo que después no vamos a poder sostener.
  ['p4-3-la-excusa', { titulo: [{ texto: 'AquíMatch les' }, { texto: 'da la excusa.', acento: true }], sub: ['Quienes usan la app en tu local pueden', 'verse entre ellos y, si hay interés de', 'los dos, conversar.'], pie: 'desliza →' }],
  // "Cuánta gente hay ahora" decía otra cosa de la que el panel muestra: no
  // cuenta a los clientes del bar, cuenta a quienes usan AquíMatch ahí.
  ['p4-4-el-panel', { titulo: [{ texto: 'Y tú ves' }, { texto: 'cómo va.', acento: true }], sub: ['Cuántos usuarios de AquíMatch se activan en', 'tu local, a qué hora y en qué rangos de edad.', 'Solo cifras: nunca perfiles ni nombres.'], pie: 'desliza →' }],
  // Honesto sin centrarse en la duda: se invita a probar y evaluar juntos, y no
  // se promete ningún resultado de ventas.
  ['p4-5-piloto', { titulo: [{ texto: 'Piloto gratis' }, { texto: '60 días.', acento: true }], sub: ['Pruébalo en tu local y evaluamos juntos', 'cómo participa tu gente. Sin compromiso.', 'aquimatch.cl/locales'], pie: 'aquimatch spa · santiago' }],
]

await mkdir(SALIDA, { recursive: true })
for (const [nombre, config] of laminas) {
  const ruta = `${SALIDA}/${nombre}.png`
  await sharp(Buffer.from(lamina(config))).png().toFile(ruta)
  console.log('✓', nombre)
}
console.log(`\n${laminas.length} láminas en ${SALIDA}`)
