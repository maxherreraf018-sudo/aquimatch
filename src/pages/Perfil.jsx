import { useEffect, useState } from 'react'
import { getAuth, signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/config'
import { obtenerUsuarioPropio, actualizarUsuario, guardarDatosPrivados } from '../firebase/auth'
import { elegirFoto } from '../services/fotos'
import { obtenerActivacionPropia, actualizarPlan, actualizarPreferenciaGeneroActivacion } from '../services/activation'
import { eliminarCuenta } from '../services/cuenta'
import { GOLD_OCULTO } from '../services/plataforma'
import { OPCIONES_INTERES, MAX_INTERESES } from '../data/intereses'
import { IconAgregar, IconCerrar, IconLapiz, IconMenuVertical, IconBasurero, IconEstrella } from '../components/Icons'
import BottomNav from '../components/BottomNav'

const OPCIONES_PLAN = [
  { valor: 'trago', etiqueta: 'Compartir un trago', emoji: '🍸' },
  { valor: 'conversar', etiqueta: 'Tener una buena conversación', emoji: '💬' },
  { valor: 'pasarlo_bien', etiqueta: 'Pasarlo bien', emoji: '🎉' },
  { valor: 'bailar', etiqueta: 'Bailar', emoji: '🕺' },
  { valor: 'amigos', etiqueta: 'Hacer nuevos amigos', emoji: '👥' },
  { valor: 'sorprender', etiqueta: 'Dejarme sorprender', emoji: '✨' },
]

const MAPA_INTERESES = Object.fromEntries(OPCIONES_INTERES.map((op) => [op.valor, op]))

// Los tres únicos nombres de archivo que las reglas de Storage aceptan.
const NOMBRES_FOTO = ['principal.jpg', 'adicional-0.jpg', 'adicional-1.jpg']

// De la URL guardada al archivo real que hay detrás.
//
// POR QUÉ EXISTE ESTO: el nombre del archivo dejó de decir en qué lugar del
// perfil está la foto. "Usar como foto de perfil" intercambia las URL pero no
// mueve los archivos, así que después de un intercambio la foto de perfil vive
// en `adicional-0.jpg`. Subir la foto 2 a "su" nombre pisaba ese archivo, y la
// foto de perfil quedaba apuntando a algo que ya no existía: foto rota. Le
// pasó a Max probando la versión 24.
function rutaDeFoto(url) {
  if (!url) return null
  try {
    return ref(storage, url).fullPath
  } catch (err) {
    // Una URL que no sea de este bucket (no debería pasar) no rompe nada:
    // simplemente no cuenta como ocupante de ningún archivo.
    return null
  }
}

// Dónde subir la foto de un lugar del perfil, sin pisar la de otro.
//
// Se reutiliza el archivo que ese lugar ya tiene — salvo que lo comparta con
// otro lugar, que es el estado roto que dejó el bug de arriba. En ese caso se
// trata como vacío y se toma un nombre libre, lo que deshace la colisión sola
// en cuanto la persona vuelve a subir esa foto.
function rutaParaSubir(usuario, uid, slot) {
  const urls = [usuario?.fotoPrincipal || null, usuario?.fotosAdicionales?.[0] || null, usuario?.fotosAdicionales?.[1] || null]
  const rutas = urls.map(rutaDeFoto)
  const indice = slot === 'principal' ? 0 : slot + 1
  const propia = rutas[indice]
  const compartida = propia && rutas.filter((r) => r === propia).length > 1

  if (propia && !compartida) return propia

  const ocupadas = new Set(rutas.filter(Boolean))
  const libre = NOMBRES_FOTO.find((n) => !ocupadas.has(`fotos-perfil/${uid}/${n}`))
  // Con 3 nombres y 3 lugares, si hay una colisión siempre sobra un nombre.
  // El respaldo es por si acaso, para no subir a `undefined`.
  return `fotos-perfil/${uid}/${libre || NOMBRES_FOTO[indice]}`
}

const OPCIONES_PREFERENCIA_GENERO = [
  { valor: 'mujeres', etiqueta: 'Mujeres' },
  { valor: 'hombres', etiqueta: 'Hombres' },
  { valor: 'ambos', etiqueta: 'Ambos' },
]

export default function Perfil() {
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid

  const [cargando, setCargando] = useState(true)
  const [usuario, setUsuario] = useState(null)
  const [activacion, setActivacion] = useState(null)
  const [mostrarSelectorPlan, setMostrarSelectorPlan] = useState(false)
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [fotoPendiente, setFotoPendiente] = useState(null)
  const [fotoPendientePreview, setFotoPendientePreview] = useState(null)
  const [slotFotoPendiente, setSlotFotoPendiente] = useState(null) // 'principal' | 0 | 1
  const [mostrarGestorFotos, setMostrarGestorFotos] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [errorFoto, setErrorFoto] = useState('')
  const [cambiandoPrincipal, setCambiandoPrincipal] = useState(false)
  const [eliminandoFoto, setEliminandoFoto] = useState(false)
  const [intereses, setIntereses] = useState([])
  const [editandoIntereses, setEditandoIntereses] = useState(false)
  const [guardandoIntereses, setGuardandoIntereses] = useState(false)
  const [editandoContacto, setEditandoContacto] = useState(false)
  const [guardandoContacto, setGuardandoContacto] = useState(false)
  const [contactoNombre, setContactoNombre] = useState('')
  const [contactoTelefono, setContactoTelefono] = useState('')
  const [guardandoPreferencia, setGuardandoPreferencia] = useState(false)
  const [mostrarEliminar, setMostrarEliminar] = useState(false)
  const [confirmaEliminar, setConfirmaEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  useEffect(() => {
    let activo = true
    async function cargar() {
      const [datosUsuario, datosActivacion] = await Promise.all([
        // Propio, no de otra persona: incluye los datos privados (contacto de
        // confianza, correo) que no viven en el documento público.
        obtenerUsuarioPropio(uid),
        obtenerActivacionPropia(uid),
      ])
      if (!activo) return
      setUsuario(datosUsuario)
      setActivacion(datosActivacion)
      setIntereses(datosUsuario?.intereses || [])
      setContactoNombre(datosUsuario?.contactoConfianza?.nombre || '')
      setContactoTelefono(datosUsuario?.contactoConfianza?.telefono || '')
      setCargando(false)
    }
    cargar()
    return () => {
      activo = false
    }
  }, [uid])

  function manejarSeleccionarFoto(slot) {
    return async () => {
      try {
        const blob = await elegirFoto()
        if (!blob) return
        setErrorFoto('')
        setSlotFotoPendiente(slot)
        setFotoPendiente(blob)
        setFotoPendientePreview(URL.createObjectURL(blob))
      } catch (err) {
        setErrorFoto(`No pudimos abrir la cámara/galería. (${err?.code || err?.message || 'error desconocido'})`)
      }
    }
  }

  function manejarCancelarFoto() {
    if (fotoPendientePreview) URL.revokeObjectURL(fotoPendientePreview)
    setFotoPendiente(null)
    setFotoPendientePreview(null)
    setSlotFotoPendiente(null)
  }

  async function manejarConfirmarFoto() {
    if (!fotoPendiente || slotFotoPendiente === null) return
    setErrorFoto('')
    setSubiendoFoto(true)
    try {
      const storageRef = ref(storage, rutaParaSubir(usuario, uid, slotFotoPendiente))
      await uploadBytes(storageRef, fotoPendiente)
      const fotoURL = await getDownloadURL(storageRef)
      if (slotFotoPendiente === 'principal') {
        const cambios = { fotoPrincipal: fotoURL }
        // Si estaba trabada por falta de foto, agregar la foto tiene que
        // reactivar la verificación. La función del servidor solo se dispara
        // cuando el estado es "pendiente" y hay una selfie nueva, así que hay
        // que volver a marcar las dos cosas — si no, la persona agrega la foto
        // y se queda igual de trabada, sin entender por qué.
        if (usuario?.estadoVerificacion === 'falta_foto') {
          cambios.estadoVerificacion = 'pendiente'
          cambios.selfieActualizadaEn = Date.now()
        }
        await actualizarUsuario(uid, cambios)
        setUsuario((prev) => ({ ...(prev || {}), ...cambios }))
      } else {
        const existentes = usuario?.fotosAdicionales || []
        const fotosAdicionales = [existentes[0] ?? null, existentes[1] ?? null]
        fotosAdicionales[slotFotoPendiente] = fotoURL
        await actualizarUsuario(uid, { fotosAdicionales })
        setUsuario((prev) => ({ ...(prev || {}), fotosAdicionales }))
      }
      manejarCancelarFoto()
    } catch (err) {
      setErrorFoto('No pudimos subir tu foto. Intenta de nuevo.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  // Convierte la foto 2 o la 3 en la foto de perfil, intercambiándola con la
  // que estaba de principal (nadie pierde una foto por reordenar).
  //
  // Solo se intercambian las URL guardadas en el perfil: los archivos en
  // Storage se quedan con el nombre que tenían. No importa — todo, incluida
  // la verificación por selfie, trabaja con la URL y no con la ruta.
  //
  // No se vuelve a pedir verificación. Fue una decisión explícita: la selfie
  // se pide una sola vez, al crear la cuenta, y las 3 fotos ya son del mismo
  // dueño de la cuenta. Obligar a re-verificar por reordenar castigaría algo
  // que no tiene nada de sospechoso.
  async function manejarHacerPrincipal(indiceAdicional) {
    if (cambiandoPrincipal || subiendoFoto) return false
    const existentes = usuario?.fotosAdicionales || []
    const nueva = existentes[indiceAdicional]
    if (!nueva) return false

    setErrorFoto('')
    setCambiandoPrincipal(true)
    try {
      const fotosAdicionales = [existentes[0] ?? null, existentes[1] ?? null]
      fotosAdicionales[indiceAdicional] = usuario?.fotoPrincipal || null
      const cambios = { fotoPrincipal: nueva, fotosAdicionales }
      await actualizarUsuario(uid, cambios)
      setUsuario((prev) => ({ ...(prev || {}), ...cambios }))
      return true
    } catch (err) {
      setErrorFoto('No pudimos cambiar tu foto de perfil. Intenta de nuevo.')
      return false
    } finally {
      setCambiandoPrincipal(false)
    }
  }

  // Elimina la foto 2 o la 3. La foto de perfil no se puede eliminar: sin ella
  // la verificación por selfie no tiene contra qué comparar, y esa es
  // exactamente la trampa que dejaba gente atrapada antes (ver el estado
  // 'falta_foto').
  //
  // OJO CON LA RUTA: se borra por la URL guardada, NO por
  // `fotos-perfil/{uid}/adicional-N.jpg`. Al usar "usar como foto de perfil"
  // se intercambian las URL pero los archivos se quedan con el nombre que
  // tenían, así que después de un intercambio `adicional-0.jpg` puede ser
  // justamente la foto de perfil. Borrar por ruta dejaría el perfil apuntando
  // a un archivo que ya no existe.
  async function manejarEliminarFoto(indiceAdicional) {
    if (eliminandoFoto || subiendoFoto || cambiandoPrincipal) return false
    const existentes = usuario?.fotosAdicionales || []
    const url = existentes[indiceAdicional]
    if (!url) return false

    setErrorFoto('')
    setEliminandoFoto(true)
    try {
      // Si otro lugar del perfil apunta al MISMO archivo —el estado roto que
      // dejó el bug del intercambio—, borrarlo dejaría a esa otra foto sin
      // archivo. En ese caso solo se suelta la referencia y el archivo queda,
      // porque sigue siendo la foto de alguien.
      const ruta = rutaDeFoto(url)
      const otras = [usuario?.fotoPrincipal, ...(usuario?.fotosAdicionales || [])]
        .filter((u, i) => u && i !== indiceAdicional + 1)
        .map(rutaDeFoto)
      const compartida = ruta && otras.includes(ruta)

      if (!compartida) {
        try {
          await deleteObject(ref(storage, url))
        } catch (err) {
          // Si el archivo ya no estaba, el objetivo igual se cumplió. Cualquier
          // otro error sí se propaga: no queremos decirle a alguien que su foto
          // se borró mientras sigue descargable con su enlace.
          if (err?.code !== 'storage/object-not-found') throw err
        }
      }
      const fotosAdicionales = [existentes[0] ?? null, existentes[1] ?? null]
      fotosAdicionales[indiceAdicional] = null
      await actualizarUsuario(uid, { fotosAdicionales })
      setUsuario((prev) => ({ ...(prev || {}), fotosAdicionales }))
      return true
    } catch (err) {
      setErrorFoto('No pudimos eliminar la foto. Intenta de nuevo.')
      return false
    } finally {
      setEliminandoFoto(false)
    }
  }

  async function manejarCambiarPlan(plan) {
    setGuardandoPlan(true)
    try {
      await actualizarPlan(uid, plan)
      setActivacion((prev) => ({ ...(prev || {}), plan }))
      setMostrarSelectorPlan(false)
    } finally {
      setGuardandoPlan(false)
    }
  }

  async function manejarCambiarPreferencia(valor) {
    if (guardandoPreferencia || usuario?.preferenciaGenero === valor) return
    setGuardandoPreferencia(true)
    try {
      await actualizarUsuario(uid, { preferenciaGenero: valor })
      setUsuario((prev) => ({ ...(prev || {}), preferenciaGenero: valor }))
      // Si ya está activo en un lugar, también actualizamos la activación en
      // curso — si no, el cambio no afectaría a Descubrir hasta la próxima vez.
      if (activacion?.activa) {
        await actualizarPreferenciaGeneroActivacion(uid, valor)
      }
    } finally {
      setGuardandoPreferencia(false)
    }
  }

  async function manejarToggleInteres(valor) {
    if (guardandoIntereses) return
    const yaEstaba = intereses.includes(valor)
    if (!yaEstaba && intereses.length >= MAX_INTERESES) return

    const nuevaLista = yaEstaba ? intereses.filter((v) => v !== valor) : [...intereses, valor]
    setIntereses(nuevaLista)
    setGuardandoIntereses(true)
    try {
      await actualizarUsuario(uid, { intereses: nuevaLista })
      setUsuario((prev) => ({ ...(prev || {}), intereses: nuevaLista }))
    } catch (err) {
      // Si falla el guardado, revertimos el cambio visual.
      setIntereses(intereses)
    } finally {
      setGuardandoIntereses(false)
    }
  }

  async function manejarGuardarContacto() {
    setGuardandoContacto(true)
    try {
      const contactoConfianza = {
        nombre: contactoNombre.trim(),
        telefono: contactoTelefono.trim(),
      }
      // Va a la subcolección privada: es el nombre y el teléfono de un tercero
      // que ni siquiera usa la app y nunca consintió aparecer acá.
      await guardarDatosPrivados(uid, { contactoConfianza })
      setUsuario((prev) => ({ ...(prev || {}), contactoConfianza }))
      setEditandoContacto(false)
    } finally {
      setGuardandoContacto(false)
    }
  }

  async function manejarCerrarSesion() {
    await signOut(getAuth())
    navigate('/')
  }

  async function manejarEliminarCuenta() {
    if (!confirmaEliminar || eliminando) return
    setEliminando(true)
    setErrorEliminar('')
    try {
      await eliminarCuenta()
      await signOut(getAuth())
      navigate('/')
    } catch (err) {
      setErrorEliminar('No pudimos eliminar tu cuenta. Intenta de nuevo.')
      setEliminando(false)
    }
  }

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Cargando tu perfil...</p>
      </div>
    )
  }

  const planActual = OPCIONES_PLAN.find((op) => op.valor === activacion?.plan)
  const tieneContacto = !!(usuario?.contactoConfianza?.nombre && usuario?.contactoConfianza?.telefono)

  return (
    <div className="screen screen-with-nav">
      <h1 style={{ marginBottom: 24 }}>Tu perfil</h1>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          onClick={() => setMostrarGestorFotos(true)}
          style={{
            width: 132,
            height: 132,
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'var(--gradient)',
            boxShadow: '0 14px 36px -10px rgba(255, 45, 142, 0.55)',
            cursor: 'pointer',
            margin: '0 auto 14px',
          }}
        >
          {usuario?.fotoPrincipal && (
            <img
              src={usuario.fotoPrincipal}
              alt=""
              className="foto-persona"
            />
          )}
        </div>
        <h2 style={{ fontSize: 20 }}>{usuario?.nombre || 'Sin nombre'}</h2>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>
          Foto de perfil — toca para ver todas tus fotos
        </p>

        {errorFoto && (
          <p className="error-text" style={{ textAlign: 'center', marginTop: 12 }}>
            {errorFoto}
          </p>
        )}
      </div>

      {/* Gestor de las 3 fotos — se abre al tocar la foto de perfil de arriba */}
      {mostrarGestorFotos && (
        <GestorFotos
          usuario={usuario}
          onCerrar={() => setMostrarGestorFotos(false)}
          manejarSeleccionarFoto={manejarSeleccionarFoto}
          manejarHacerPrincipal={manejarHacerPrincipal}
          cambiandoPrincipal={cambiandoPrincipal}
          manejarEliminarFoto={manejarEliminarFoto}
          eliminandoFoto={eliminandoFoto}
          subiendoFoto={subiendoFoto}
          errorFoto={errorFoto}
        />
      )}

      {/* Entrada a Gold. Todavía no se puede comprar nada: la pantalla muestra
          las funciones y los precios reales y deja un "avísame", que es lo que
          nos dice si alguien pagaría antes de construir todo el cobro.

          OCULTA EN iOS a propósito (2026-08-19). La regla 2.1 de Apple rechaza
          funciones anunciadas como "próximamente", y esta pantalla dice
          literalmente "Todavía no puedes activarlo". Con la app ya rechazada
          por 4.3, el próximo revisor no llega neutral y no conviene darle nada
          más que mirar. Además hoy no cuesta nada esconderla: sin usuarios, el
          contador de interesados iba a marcar cero igual.

          En Android queda visible, que es donde va a haber usuarios primero.
          Se vuelve a activar en iOS en la primera actualización después de que
          Apple apruebe. */}
      {!GOLD_OCULTO && (
      <div
        onClick={() => navigate('/gold')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 16,
          background: 'rgba(255, 45, 142, 0.10)',
          border: '1px solid rgba(255, 45, 142, 0.45)',
          cursor: 'pointer',
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 100,
                background: 'var(--gradient)',
                color: '#fff',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
              }}
            >
              GOLD
            </span>
            <span style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>
              Muy pronto
            </span>
          </div>
          <div style={{ fontSize: 12.5 }}>Mira quién te mostró interés, y más.</div>
        </div>
        <span style={{ color: 'var(--magenta)', fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
      )}

      <EtiquetaSeccion texto="Tu perfil" />
      <div className="grupo-perfil" style={{ marginBottom: 24 }}>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 9 }}>Me gustaría conocer</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {OPCIONES_PREFERENCIA_GENERO.map((op) => {
              const seleccionado = usuario?.preferenciaGenero === op.valor
              return (
                <span
                  key={op.valor}
                  onClick={() => !guardandoPreferencia && manejarCambiarPreferencia(op.valor)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 100,
                    background: seleccionado ? 'rgba(255, 45, 142, 0.14)' : 'var(--bg-card)',
                    border: `1px solid ${seleccionado ? 'var(--magenta)' : 'var(--border)'}`,
                    color: seleccionado ? 'var(--text)' : 'var(--text-dim)',
                    fontSize: 12.5,
                    fontWeight: seleccionado ? 600 : 400,
                    cursor: guardandoPreferencia ? 'default' : 'pointer',
                    opacity: guardandoPreferencia ? 0.7 : 1,
                  }}
                >
                  {op.etiqueta}
                </span>
              )
            })}
          </div>
        </div>

        <div className="separador-grupo" />

        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editandoIntereses ? 4 : 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Tus intereses</span>
            <button
              className="btn btn-ghost"
              style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
              onClick={() => setEditandoIntereses((v) => !v)}
            >
              {editandoIntereses ? 'Listo' : 'Editar'}
            </button>
          </div>

          {editandoIntereses && (
            <p style={{ fontSize: 12, marginBottom: 10 }}>
              Elige hasta {MAX_INTERESES}. Llevas {intereses.length} de {MAX_INTERESES}.
            </p>
          )}

          {editandoIntereses ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {OPCIONES_INTERES.map((op) => (
                <div
                  key={op.valor}
                  className={`chip ${intereses.includes(op.valor) ? 'selected' : ''}`}
                  style={{
                    flex: '0 0 auto',
                    cursor: guardandoIntereses ? 'default' : 'pointer',
                    opacity: guardandoIntereses ? 0.7 : 1,
                  }}
                  onClick={() => manejarToggleInteres(op.valor)}
                >
                  {op.emoji} {op.etiqueta}
                </div>
              ))}
            </div>
          ) : intereses.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {intereses.map((valor) => {
                const op = MAPA_INTERESES[valor]
                if (!op) return null
                return (
                  <span
                    key={valor}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 18,
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text)',
                      fontSize: 12.5,
                    }}
                  >
                    {op.emoji} {op.etiqueta}
                  </span>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 12.5 }}>Todavía no elegiste ningún interés.</p>
          )}
        </div>
      </div>

      {activacion?.activa && (
        <>
          <EtiquetaSeccion texto="Ahora" />
          <div className="grupo-perfil" style={{ marginBottom: 24, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {planActual ? `${planActual.emoji} ${planActual.etiqueta}` : 'Sin definir'}
              </span>
              <button
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
                onClick={() => setMostrarSelectorPlan((v) => !v)}
              >
                Cambiar
              </button>
            </div>
          </div>

          {mostrarSelectorPlan && (
            <div className="stack" style={{ marginBottom: 24 }}>
              {OPCIONES_PLAN.map((op) => (
                <div
                  key={op.valor}
                  className={`chip ${activacion?.plan === op.valor ? 'selected' : ''}`}
                  style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => !guardandoPlan && manejarCambiarPlan(op.valor)}
                >
                  <span style={{ marginRight: 10 }}>{op.emoji}</span>
                  {op.etiqueta}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <EtiquetaSeccion texto="Seguridad" />
      <div className="grupo-perfil" style={{ marginBottom: 24, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editandoContacto ? 12 : 4 }}>
          <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Contacto de confianza</span>
          <button
            className="btn btn-ghost"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            onClick={() => setEditandoContacto((v) => !v)}
          >
            {editandoContacto ? 'Cerrar' : tieneContacto ? 'Editar' : 'Agregar'}
          </button>
        </div>

        {editandoContacto ? (
          <div className="stack">
            <div className="field">
              <label>Nombre</label>
              <input
                className="input"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                placeholder="Ej: Camila (hermana)"
              />
            </div>
            <div className="field">
              <label>Teléfono (WhatsApp, con código de país)</label>
              <input
                className="input"
                value={contactoTelefono}
                onChange={(e) => setContactoTelefono(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ padding: '10px 0', fontSize: 13 }}
              onClick={manejarGuardarContacto}
              disabled={guardandoContacto || !contactoNombre.trim() || !contactoTelefono.trim()}
            >
              {guardandoContacto ? 'Guardando...' : 'Guardar contacto'}
            </button>
          </div>
        ) : tieneContacto ? (
          <p style={{ fontSize: 13, color: 'var(--text)' }}>
            {usuario.contactoConfianza.nombre} · {usuario.contactoConfianza.telefono}
          </p>
        ) : (
          <p style={{ fontSize: 12.5 }}>
            Agrega a alguien de confianza para poder avisarle en qué lugar estás cuando actives tu
            participación.
          </p>
        )}
      </div>

      <EtiquetaSeccion texto="Cuenta" />
      <button
        className="btn btn-secondary"
        onClick={() => navigate('/cuenta')}
        style={{ marginBottom: 10 }}
      >
        Configuración de la cuenta
      </button>
      <button className="btn btn-secondary" onClick={manejarCerrarSesion} style={{ marginBottom: 10 }}>
        Cerrar sesión
      </button>
      <button
        className="btn btn-ghost"
        style={{ color: 'var(--danger)', fontSize: 12.5 }}
        onClick={() => setMostrarEliminar(true)}
      >
        Eliminar mi cuenta
      </button>

      <div className="spacer" />

      <BottomNav />

      {/* Confirmación antes de subir la foto — tarjeta flotante sobre el perfil desenfocado.
          zIndex más alto que GestorFotos, porque también puede abrirse desde ahí. */}
      {fotoPendientePreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 280,
              background: 'rgba(18,0,34,0.97)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 22,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                margin: '0 auto 16px',
                overflow: 'hidden',
                boxShadow: '0 10px 26px -8px rgba(255, 45, 142, 0.5)',
              }}
            >
              <img
                src={fotoPendientePreview}
                alt=""
                className="foto-persona"
              />
            </div>
            <p style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 18 }}>
              ¿Usar esta foto?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={manejarCancelarFoto}
                disabled={subiendoFoto}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={manejarConfirmarFoto}
                disabled={subiendoFoto}
              >
                {subiendoFoto ? 'Subiendo...' : 'Usar foto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación antes de eliminar la cuenta — no hay vuelta atrás */}
      {mostrarEliminar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 300,
              background: 'rgba(18,0,34,0.97)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: 22,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <h2 style={{ fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>¿Eliminar tu cuenta?</h2>
            <p style={{ fontSize: 12.5, marginBottom: 16, lineHeight: 1.6 }}>
              Se borra tu perfil, fotos y selfie de verificación para siempre. No podrás
              recuperarla. Los chats que ya tenías con otras personas seguirán existiendo para
              ellas, sin tu nombre ni tu foto.
            </p>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 11.5,
                textAlign: 'left',
                marginBottom: 16,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={confirmaEliminar}
                onChange={(e) => setConfirmaEliminar(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0, width: 14, height: 14 }}
              />
              <span>Entiendo que esta acción no se puede deshacer</span>
            </label>
            {errorEliminar && (
              <p className="error-text" style={{ marginBottom: 10 }}>
                {errorEliminar}
              </p>
            )}
            <button
              className="btn"
              style={{ width: '100%', padding: '11px 0', fontSize: 13, background: 'var(--danger)', color: '#fff', marginBottom: 10 }}
              onClick={manejarEliminarCuenta}
              disabled={!confirmaEliminar || eliminando}
            >
              {eliminando ? 'Eliminando...' : 'Eliminar cuenta para siempre'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '9px 0', fontSize: 12.5 }}
              onClick={() => {
                setMostrarEliminar(false)
                setConfirmaEliminar(false)
                setErrorEliminar('')
              }}
              disabled={eliminando}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EtiquetaSeccion({ texto }) {
  return (
    <p
      style={{
        fontSize: 10.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
        marginBottom: 8,
      }}
    >
      {texto}
    </p>
  )
}

const ETIQUETAS_SLOT = ['Foto de perfil', 'Foto 2', 'Foto 3']

function OpcionMenu({ icono, texto, onClick, deshabilitado, peligro, ultima }) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '12px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: ultima ? 'none' : '1px solid rgba(255,255,255,0.08)',
        color: peligro ? 'var(--danger)' : 'white',
        fontSize: 13,
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: deshabilitado ? 'default' : 'pointer',
        opacity: deshabilitado ? 0.5 : 1,
      }}
    >
      {icono}
      {texto}
    </button>
  )
}

// Visor de las 3 fotos del perfil propio (a diferencia de FotoCarrusel, acá
// SÍ se muestran los slots vacíos — con un botón para agregar — porque es
// para gestionar tus propias fotos, no para ver las de otra persona.
function GestorFotos({
  usuario,
  onCerrar,
  manejarSeleccionarFoto,
  manejarHacerPrincipal,
  cambiandoPrincipal,
  manejarEliminarFoto,
  eliminandoFoto,
  subiendoFoto,
  errorFoto,
}) {
  const [indice, setIndice] = useState(0)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false)
  const slots = [usuario?.fotoPrincipal || null, usuario?.fotosAdicionales?.[0] || null, usuario?.fotosAdicionales?.[1] || null]
  const slotKeys = ['principal', 0, 1]
  const fotoActual = slots[indice]
  const ocupado = subiendoFoto || cambiandoPrincipal || eliminandoFoto
  // En la foto de perfil el menú queda con una sola opción ("cambiar"), y así
  // se deja: las otras dos no aplican —ya es la principal, y borrarla dejaría
  // la verificación sin con qué comparar—. Hacer que el botón aparezca y
  // desaparezca al pasar de foto confunde más que un menú corto.
  const esPrincipal = indice === 0

  // Al hacer principal la 2 o la 3, las fotos se intercambian bajo los pies:
  // quedarse en el mismo slot mostraría la foto vieja y parecería que no pasó
  // nada. Se salta a la 1, que es donde está ahora la foto elegida.
  async function hacerPrincipal() {
    setMenuAbierto(false)
    const ok = await manejarHacerPrincipal(slotKeys[indice])
    if (ok) irASlot(0)
  }

  async function eliminar() {
    const ok = await manejarEliminarFoto(slotKeys[indice])
    if (ok) {
      setConfirmandoBorrar(false)
      // Queda un espacio vacío donde estaba la foto. Se vuelve a la primera,
      // que siempre tiene algo, en vez de dejar a la persona mirando un hueco.
      irASlot(0)
    }
  }

  function irASlot(i) {
    // Ni el menú ni la confirmación de borrado pueden sobrevivir a un cambio
    // de foto: si no, se pregunta por una y se borra otra.
    setMenuAbierto(false)
    setConfirmandoBorrar(false)
    setIndice(i)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {fotoActual ? (
          <img src={fotoActual} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <label
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 10,
              cursor: 'pointer',
            }}
            onClick={manejarSeleccionarFoto(slotKeys[indice])}
          >
            <IconAgregar size={32} style={{ color: 'rgba(255,255,255,0.6)' }} />
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Agregar foto</span>
          </label>
        )}

        <div
          style={{
            position: 'absolute',
            top: 'calc(14px + env(safe-area-inset-top))',
            left: 14,
            right: 14,
            display: 'flex',
            gap: 4,
          }}
        >
          {slots.map((_, i) => (
            <div
              key={i}
              onClick={() => irASlot(i)}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i === indice ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        <div
          onClick={onCerrar}
          style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top))',
            right: 14,
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 3,
          }}
        >
          <IconCerrar size={16} />
        </div>

        {/* Los tres puntos solo con foto: en un espacio vacío no hay nada que
            hacerle, y ahí manda el "Agregar foto" del centro. */}
        {fotoActual && (
          <div
            onClick={() => !ocupado && setMenuAbierto((v) => !v)}
            style={{
              position: 'absolute',
              top: 'calc(12px + env(safe-area-inset-top))',
              right: 52,
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: menuAbierto ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.45)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: ocupado ? 'default' : 'pointer',
              zIndex: 3,
            }}
          >
            <IconMenuVertical size={17} />
          </div>
        )}

        {/* Capa que oscurece y cierra al tocar afuera. Va por debajo del menú
            pero por encima de las zonas de pasar foto, para que el primer
            toque cierre el menú en vez de cambiar de foto sin querer. */}
        {menuAbierto && (
          <div
            onClick={() => setMenuAbierto(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2 }}
          />
        )}

        {menuAbierto && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(50px + env(safe-area-inset-top))',
              right: 14,
              minWidth: 210,
              background: '#1c1926',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              overflow: 'hidden',
              zIndex: 4,
            }}
          >
            <OpcionMenu
              icono={<IconLapiz size={15} />}
              texto={subiendoFoto ? 'Subiendo...' : 'Cambiar esta foto'}
              onClick={() => {
                setMenuAbierto(false)
                manejarSeleccionarFoto(slotKeys[indice])()
              }}
              deshabilitado={ocupado}
              ultima={esPrincipal}
            />
            {!esPrincipal && (
              <OpcionMenu
                icono={<IconEstrella size={15} />}
                texto={cambiandoPrincipal ? 'Cambiando...' : 'Usar como foto de perfil'}
                onClick={hacerPrincipal}
                deshabilitado={ocupado}
              />
            )}
            {!esPrincipal && (
              <OpcionMenu
                icono={<IconBasurero size={15} />}
                texto="Eliminar esta foto"
                onClick={() => {
                  setMenuAbierto(false)
                  setConfirmandoBorrar(true)
                }}
                deshabilitado={ocupado}
                peligro
                ultima
              />
            )}
          </div>
        )}

        {/* Confirmación en el centro, encima de la foto. Antes vivía abajo,
            junto a los botones; ahora que los botones se fueron al menú, tiene
            que pedirse donde la persona está mirando. */}
        {confirmandoBorrar && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.62)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              zIndex: 5,
            }}
          >
            <div
              style={{
                background: '#1c1926',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 16,
                padding: '20px 18px',
                textAlign: 'center',
                width: '100%',
                maxWidth: 300,
              }}
            >
              <p style={{ color: 'white', fontSize: 14.5, marginBottom: 4 }}>¿Eliminar esta foto?</p>
              <p style={{ color: 'var(--text-faint)', fontSize: 12.5, marginBottom: 16 }}>
                No se puede deshacer.
              </p>
              <button
                type="button"
                disabled={ocupado}
                onClick={eliminar}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '11px 0',
                  marginBottom: 8,
                  borderRadius: 13,
                  border: '1px solid var(--danger)',
                  background: 'transparent',
                  color: 'var(--danger)',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                  cursor: ocupado ? 'default' : 'pointer',
                  opacity: ocupado ? 0.6 : 1,
                }}
              >
                {eliminandoFoto ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoBorrar(false)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '11px 0',
                  borderRadius: 13,
                  border: '1px solid rgba(255,255,255,0.22)',
                  background: 'transparent',
                  color: 'white',
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {indice > 0 && (
          <div
            onClick={() => irASlot(indice - 1)}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer' }}
          />
        )}
        {indice < 2 && (
          <div
            onClick={() => irASlot(indice + 1)}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer' }}
          />
        )}
      </div>

      <div
        style={{
          padding: '16px 20px calc(16px + env(safe-area-inset-bottom))',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        <p style={{ color: 'white', fontSize: 13 }}>{ETIQUETAS_SLOT[indice]}</p>
        {fotoActual && (
          <p style={{ color: 'var(--text-faint)', fontSize: 11.5, marginTop: 4 }}>
            Toca los tres puntos de arriba para cambiarla o eliminarla
          </p>
        )}

        {errorFoto && (
          <p className="error-text" style={{ marginTop: 10 }}>
            {errorFoto}
          </p>
        )}
      </div>
    </div>
  )
}
