import { useEffect, useState } from 'react'
import { getAuth, signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase/config'
import { obtenerUsuario, actualizarUsuario } from '../firebase/auth'
import { elegirFoto } from '../services/fotos'
import { obtenerActivacionPropia, actualizarPlan, actualizarPreferenciaGeneroActivacion } from '../services/activation'
import { eliminarCuenta } from '../services/cuenta'
import { OPCIONES_INTERES, MAX_INTERESES } from '../data/intereses'
import { IconAgregar, IconCerrar, IconLapiz } from '../components/Icons'
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
        obtenerUsuario(uid),
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
      const nombreArchivo = slotFotoPendiente === 'principal' ? 'principal' : `adicional-${slotFotoPendiente}`
      const storageRef = ref(storage, `fotos-perfil/${uid}/${nombreArchivo}.jpg`)
      await uploadBytes(storageRef, fotoPendiente)
      const fotoURL = await getDownloadURL(storageRef)
      if (slotFotoPendiente === 'principal') {
        await actualizarUsuario(uid, { fotoPrincipal: fotoURL })
        setUsuario((prev) => ({ ...(prev || {}), fotoPrincipal: fotoURL }))
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
      await actualizarUsuario(uid, { contactoConfianza })
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
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
          subiendoFoto={subiendoFoto}
          errorFoto={errorFoto}
        />
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
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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

// Visor de las 3 fotos del perfil propio (a diferencia de FotoCarrusel, acá
// SÍ se muestran los slots vacíos — con un botón para agregar — porque es
// para gestionar tus propias fotos, no para ver las de otra persona.
function GestorFotos({ usuario, onCerrar, manejarSeleccionarFoto, subiendoFoto, errorFoto }) {
  const [indice, setIndice] = useState(0)
  const slots = [usuario?.fotoPrincipal || null, usuario?.fotosAdicionales?.[0] || null, usuario?.fotosAdicionales?.[1] || null]
  const slotKeys = ['principal', 0, 1]
  const fotoActual = slots[indice]

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
              onClick={() => setIndice(i)}
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
          }}
        >
          <IconCerrar size={16} />
        </div>

        {indice > 0 && (
          <div
            onClick={() => setIndice((i) => i - 1)}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer' }}
          />
        )}
        {indice < 2 && (
          <div
            onClick={() => setIndice((i) => i + 1)}
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
        <p style={{ color: 'white', fontSize: 13, marginBottom: 10 }}>{ETIQUETAS_SLOT[indice]}</p>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: 13,
            cursor: subiendoFoto ? 'default' : 'pointer',
          }}
          onClick={subiendoFoto ? undefined : manejarSeleccionarFoto(slotKeys[indice])}
        >
          <IconLapiz size={14} />
          {subiendoFoto ? 'Subiendo...' : fotoActual ? 'Cambiar esta foto' : 'Agregar esta foto'}
        </label>
        {errorFoto && (
          <p className="error-text" style={{ marginTop: 10 }}>
            {errorFoto}
          </p>
        )}
      </div>
    </div>
  )
}
