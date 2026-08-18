// Genera las páginas legales del SITIO WEB a partir de las mismas secciones
// que muestra la app, para que los dos textos no puedan quedar distintos.
//
// Uso:  node scripts/generar-legales.cjs
//
// Lee:   src/data/legal.js        (Política de Privacidad)
//        src/pages/Terminos.jsx   (Términos y Condiciones)
// Escribe: hosting-public/privacidad.html
//          hosting-public/terminos.html

const fs = require('fs')
const path = require('path')

const raiz = path.join(__dirname, '..')

function escapar(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Los archivos fuente son módulos ES; se leen como texto y se evalúan solo el
// array de secciones, para no depender de un bundler solo por esto.
function leerSecciones(archivo, nombreArray) {
  const texto = fs.readFileSync(path.join(raiz, archivo), 'utf8')
  const inicio = texto.indexOf(nombreArray)
  if (inicio < 0) throw new Error(`No se encontró ${nombreArray} en ${archivo}`)
  const corchete = texto.indexOf('[', inicio)
  let nivel = 0
  let fin = corchete
  for (let i = corchete; i < texto.length; i++) {
    if (texto[i] === '[') nivel++
    if (texto[i] === ']') {
      nivel--
      if (nivel === 0) {
        fin = i
        break
      }
    }
  }
  // El array usa constantes definidas arriba en el mismo archivo (domicilio,
  // correos). Se recogen para que existan al evaluarlo.
  const constantes = (texto.match(/^const [A-Z_]+ = '[^']*'$/gm) || []).join('\n')
  const cuerpo = texto.slice(corchete, fin + 1)
  // eslint-disable-next-line no-eval
  return eval(`${constantes}\n;(${cuerpo})`)
}

function generarHtml({ titulo, actualizacion, secciones }) {
  const cuerpo = secciones
    .map((s) => {
      const partes = [`  <h2>${escapar(s.titulo)}</h2>`]
      ;(s.parrafos || []).forEach((p) => partes.push(`  <p>${escapar(p)}</p>`))
      if (s.lista?.length) {
        partes.push('  <ul>')
        s.lista.forEach((i) => partes.push(`    <li>${escapar(i)}</li>`))
        partes.push('  </ul>')
      }
      ;(s.final || []).forEach((p) => partes.push(`  <p>${escapar(p)}</p>`))
      return partes.join('\n')
    })
    .join('\n\n')

  return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapar(titulo)} — AquíMatch</title>
<style>
  :root {
    --bg: #0D0D14;
    --text: #F5F3F7;
    --text-dim: #B3A6BF;
    --text-faint: #7C7089;
    --purple: #B12DFF;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: var(--font); line-height: 1.65;
    padding: 40px 24px 72px;
  }
  main { max-width: 720px; margin: 0 auto; }
  .marca { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 24px; }
  .marca span { color: var(--purple); }
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
  .fecha { font-size: 12.5px; color: var(--text-faint); margin: 0 0 32px; }
  h2 { font-size: 17px; font-weight: 700; margin: 32px 0 8px; }
  p { font-size: 14.5px; color: var(--text-dim); margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 22px; }
  li { font-size: 14.5px; color: var(--text-dim); margin-bottom: 5px; }
  a { color: var(--purple); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .volver { display: inline-block; margin-top: 40px; font-size: 13.5px; color: var(--text-dim); }
</style>
</head>
<body>
<main>
  <p class="marca">Aquí<span>Match</span></p>
  <h1>${escapar(titulo)}</h1>
  <p class="fecha">Última actualización: ${escapar(actualizacion)}</p>

${cuerpo}

  <a class="volver" href="/">← Volver</a>
</main>
</body>
</html>
`
}

const fecha = (fs.readFileSync(path.join(raiz, 'src/data/legal.js'), 'utf8')
  .match(/ULTIMA_ACTUALIZACION = '([^']+)'/) || [])[1]

const documentos = [
  {
    salida: 'hosting-public/privacidad.html',
    titulo: 'Política de Privacidad',
    secciones: leerSecciones('src/data/legal.js', 'export const POLITICA_PRIVACIDAD'),
  },
  {
    salida: 'hosting-public/terminos.html',
    titulo: 'Términos y Condiciones',
    secciones: leerSecciones('src/pages/Terminos.jsx', 'const SECCIONES'),
  },
]

documentos.forEach((d) => {
  const html = generarHtml({ titulo: d.titulo, actualizacion: fecha, secciones: d.secciones })
  fs.writeFileSync(path.join(raiz, d.salida), html)
  console.log(`${d.salida}  —  ${d.secciones.length} secciones, ${Math.round(html.length / 1024)} KB`)
})
