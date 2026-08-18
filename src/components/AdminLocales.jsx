import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import {
  ESTADOS,
  NIVELES,
  escucharLocales,
  escucharActividadPorLugar,
  crearCuentaLocal,
  cambiarNivelLocal,
  revocarLocal,
  reactivarLocal,
} from '../services/locales'

// Sección "Locales" del panel de moderación.
//
// La lista de arriba no es decorativa: son los locales donde la app se está
// usando de verdad, ordenados por cuánta gente se activó. Esa ES la lista de a
// quién ofrecerle el panel — no tiene sentido venderle a un bar donde nunca se
// activó nadie, y sale gratis porque los contadores ya se están guardando.

const COLOR_ESTADO = {
  verificado: 'var(--magenta)',
  pendiente: 'var(--warning)',
  rechazado: 'var(--danger)',
  revocado: 'var(--text-faint)',
}

function fechaCorta(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
}

export default function AdminLocales() {
  const adminUid = getAuth().currentUser?.uid
  const [locales, setLocales] = useState([])
  const [actividad, setActividad] = useState([])
  const [creando, setCreando] = useState(null) // { placeId, placeName }
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [nivel, setNivel] = useState('basico')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const detenerLocales = escucharLocales(setLocales)
    const detenerActividad = escucharActividadPorLugar(setActividad)
    return () => {
      detenerLocales()
      detenerActividad()
    }
  }, [])

  const conCuenta = new Set(locales.map((l) => l.placeId))

  function abrirFormulario(lugar) {
    setCreando(lugar)
    setNombre('')
    setCorreo('')
    setNivel('basico')
    setNota('')
    setError('')
  }

  async function manejarCrear() {
    if (guardando || !creando) return
    setGuardando(true)
    setError('')
    try {
      await crearCuentaLocal({
        placeId: creando.placeId,
        placeName: creando.placeName,
        responsableNombre: nombre.trim(),
        responsableCorreo: correo,
        nivel,
        nota: nota.trim(),
        adminUid,
      })
      setCreando(null)
    } catch (err) {
      setError(err?.message || 'No pudimos crear la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>
        Locales con actividad {actividad.length > 0 ? `(${actividad.length})` : ''}
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
        Dónde se está usando la app de verdad. Esta es la lista de a quién ofrecerle el panel.
      </p>

      {actividad.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 26 }}>
          Todavía no hay datos. Los contadores empezaron a guardarse el 18 de agosto de 2026, así
          que aparecerá el primer lugar en cuanto alguien se active.
        </p>
      ) : (
        <div className="stack" style={{ marginBottom: 28 }}>
          {actividad.slice(0, 12).map((lugar) => (
            <div key={lugar.placeId} className="chip" style={{ padding: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>
                    {lugar.placeName || lugar.placeId}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                    {lugar.total} activaciones · {lugar.franjas} franjas horarias · última{' '}
                    {fechaCorta(lugar.ultimaMs)}
                  </div>
                </div>
                {conCuenta.has(lugar.placeId) ? (
                  <span style={{ fontSize: 11.5, color: 'var(--magenta)', flexShrink: 0 }}>
                    Con cuenta
                  </span>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5, flexShrink: 0 }}
                    onClick={() => abrirFormulario(lugar)}
                  >
                    Crear cuenta
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creando && (
        <div className="grupo-perfil" style={{ padding: 14, marginBottom: 28 }}>
          <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            Cuenta para {creando.placeName || creando.placeId}
          </div>
          <p style={{ fontSize: 11.5, marginBottom: 12 }}>
            Crear esto equivale a decir que ya verificaste que esta persona maneja el local. Deja
            anotado abajo qué prueba viste.
          </p>
          <div className="stack">
            <div className="field">
              <label>Nombre del responsable</label>
              <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="field">
              <label>Correo del responsable</label>
              <input
                className="input"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="dueno@sulocal.cl"
              />
            </div>
            <div className="field">
              <label>Acceso</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['basico', 'reforzado'].map((valor) => (
                  <span
                    key={valor}
                    onClick={() => setNivel(valor)}
                    style={{
                      padding: '7px 13px',
                      borderRadius: 100,
                      background: nivel === valor ? 'rgba(255,45,142,0.14)' : 'var(--bg-card)',
                      border: `1px solid ${nivel === valor ? 'var(--magenta)' : 'var(--border)'}`,
                      color: nivel === valor ? 'var(--text)' : 'var(--text-dim)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {NIVELES[valor]}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 11, marginTop: 6 }}>
                Los avisos le llegan a personas que están dentro del local en ese momento. Dalo solo
                si verificaste en persona.
              </p>
            </div>
            <div className="field">
              <label>Qué prueba viste</label>
              <input
                className="input"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: patente municipal a nombre de..."
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={() => setCreando(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={manejarCrear}
                disabled={guardando || !nombre.trim() || !correo.trim() || !nota.trim()}
              >
                {guardando ? 'Creando...' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>
        Cuentas de local {locales.length > 0 ? `(${locales.length})` : ''}
      </h2>
      {locales.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 28 }}>
          Todavía no hay ningún local con cuenta.
        </p>
      ) : (
        <div className="stack" style={{ marginBottom: 28 }}>
          {locales.map((local) => (
            <div key={local.placeId} className="chip" style={{ padding: 13, textAlign: 'left' }}>
              <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>
                {local.placeName || local.placeId}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '3px 0 8px' }}>
                {local.responsableNombre} · {local.responsableCorreo}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    color: COLOR_ESTADO[local.estado] || 'var(--text-dim)',
                    border: `1px solid ${COLOR_ESTADO[local.estado] || 'var(--border)'}`,
                    borderRadius: 100,
                    padding: '3px 9px',
                  }}
                >
                  {ESTADOS[local.estado] || local.estado}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{NIVELES[local.nivel]}</span>
                <span style={{ flex: 1 }} />
                {local.estado === 'revocado' ? (
                  <button
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '5px 11px', fontSize: 12 }}
                    onClick={() => reactivarLocal(local.placeId)}
                  >
                    Reactivar
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost"
                      style={{ width: 'auto', padding: '5px 11px', fontSize: 12 }}
                      onClick={() =>
                        cambiarNivelLocal(
                          local.placeId,
                          local.nivel === 'reforzado' ? 'basico' : 'reforzado'
                        )
                      }
                    >
                      {local.nivel === 'reforzado' ? 'Quitar avisos' : 'Dar avisos'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ width: 'auto', padding: '5px 11px', fontSize: 12, color: 'var(--danger)' }}
                      onClick={() => revocarLocal(local.placeId)}
                    >
                      Revocar
                    </button>
                  </>
                )}
              </div>
              {local.nota && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>{local.nota}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
