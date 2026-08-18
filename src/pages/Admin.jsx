import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  escucharSelfiesPendientes,
  escucharSelfiesRechazadas,
  actualizarEstadoVerificacion,
  escucharReportes,
  marcarReporteRevisado,
  escucharInteresGold,
} from '../services/admin'
import { obtenerUsuario } from '../firebase/auth'
import { IconVolver, IconMasTarde, IconVerificado } from '../components/Icons'

const MOTIVO_COLOR = {
  'Perfil falso': 'var(--danger)',
  'Foto falsa': 'var(--danger)',
  Acoso: 'var(--warning)',
  'Lenguaje ofensivo': 'var(--warning)',
  Otro: 'var(--text-dim)',
}

export default function Admin() {
  const navigate = useNavigate()
  const [selfies, setSelfies] = useState([])
  const [rechazadas, setRechazadas] = useState([])
  const [reportes, setReportes] = useState([])
  const [nombresCache, setNombresCache] = useState({})
  const [procesando, setProcesando] = useState(null)
  const [interesGold, setInteresGold] = useState([])

  useEffect(() => {
    const detenerSelfies = escucharSelfiesPendientes(setSelfies)
    const detenerRechazadas = escucharSelfiesRechazadas(setRechazadas)
    const detenerReportes = escucharReportes(setReportes)
    const detenerGold = escucharInteresGold(setInteresGold)
    return () => {
      detenerSelfies()
      detenerRechazadas()
      detenerReportes()
      detenerGold()
    }
  }, [])

  // Carga (una sola vez por uid) el nombre de cada persona involucrada en un reporte.
  useEffect(() => {
    const uids = new Set()
    reportes.forEach((r) => {
      uids.add(r.reportadoPor)
      uids.add(r.reportado)
    })
    uids.forEach((uid) => {
      if (!uid || nombresCache[uid]) return
      obtenerUsuario(uid).then((datos) => {
        setNombresCache((prev) => ({ ...prev, [uid]: datos?.nombre || 'Usuario eliminado' }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportes])

  async function manejarVerificacion(uid, nuevoEstado) {
    setProcesando(uid)
    try {
      await actualizarEstadoVerificacion(uid, nuevoEstado)
    } finally {
      setProcesando(null)
    }
  }

  async function manejarRevisado(reporteId) {
    setProcesando(reporteId)
    try {
      await marcarReporteRevisado(reporteId)
    } finally {
      setProcesando(null)
    }
  }

  const reportesPendientes = reportes.filter((r) => !r.revisado)
  const reportesRevisados = reportes.filter((r) => r.revisado)

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/activacion')}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', display: 'flex', cursor: 'pointer', padding: 0 }}
        >
          <IconVolver size={20} />
        </button>
        <h1 style={{ fontSize: 20 }}>Panel de moderación</h1>
      </div>

      {/* Resultado del experimento de precio de Gold. Está acá porque es el
          único panel que existe, y un dato que nadie mira no sirve de nada. */}
      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: 'rgba(255, 45, 142, 0.08)',
          border: '1px solid rgba(255, 45, 142, 0.3)',
          marginBottom: 26,
        }}
      >
        <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>
          Interés en Gold
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ color: 'var(--text)', fontSize: 26, fontWeight: 700 }}>
            {interesGold.length}
          </span>
          <span style={{ fontSize: 12.5 }}>
            {interesGold.length === 1 ? 'persona pidió aviso' : 'personas pidieron aviso'}
          </span>
        </div>
        <div style={{ fontSize: 12 }}>
          Anual: {interesGold.filter((i) => i.plan === 'anual').length} · Mensual:{' '}
          {interesGold.filter((i) => i.plan === 'mensual').length} · Sin elegir:{' '}
          {interesGold.filter((i) => i.plan === 'sin_elegir').length}
        </div>
      </div>

      {/* Selfies pendientes */}
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>
        Selfies por revisar {selfies.length > 0 ? `(${selfies.length})` : ''}
      </h2>
      {selfies.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
          No hay selfies pendientes por ahora.
        </p>
      ) : (
        <div className="stack" style={{ marginBottom: 28 }}>
          {selfies.map((perfil) => (
            <div key={perfil.uid} className="chip" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    backgroundImage: perfil.selfieVerificacion
                      ? `url(${perfil.selfieVerificacion})`
                      : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    background: perfil.selfieVerificacion ? undefined : 'var(--bg)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {perfil.nombre || 'Sin nombre'}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Foto de perfil: {perfil.fotoPrincipal ? 'sí tiene' : 'no tiene'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '8px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => manejarVerificacion(perfil.uid, 'rechazado')}
                  disabled={procesando === perfil.uid}
                >
                  <IconMasTarde size={14} /> Rechazar
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '8px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => manejarVerificacion(perfil.uid, 'aprobado')}
                  disabled={procesando === perfil.uid}
                >
                  <IconVerificado size={14} /> Aprobar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rechazados / con error — revisión manual */}
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>
        Rechazados o con error — revisar {rechazadas.length > 0 ? `(${rechazadas.length})` : ''}
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
        Estos usuarios están bloqueados hasta que reintenten su selfie o los apruebes a mano.
      </p>
      {rechazadas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
          No hay nadie rechazado por revisar.
        </p>
      ) : (
        <div className="stack" style={{ marginBottom: 28 }}>
          {rechazadas.map((perfil) => (
            <div key={perfil.uid} className="chip" style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 10,
                      backgroundImage: perfil.fotoPrincipal ? `url(${perfil.fotoPrincipal})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      background: perfil.fotoPrincipal ? undefined : 'var(--bg)',
                      marginBottom: 4,
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Foto de perfil</span>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 10,
                      backgroundImage: perfil.selfieVerificacion ? `url(${perfil.selfieVerificacion})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      background: perfil.selfieVerificacion ? undefined : 'var(--bg)',
                      marginBottom: 4,
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Selfie</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{perfil.nombre || 'Sin nombre'}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '3px 9px',
                    borderRadius: 12,
                    background: 'rgba(255,45,142,0.15)',
                    color: '#FF87BE',
                  }}
                >
                  {perfil.estadoVerificacion === 'error_verificacion'
                    ? 'Error técnico'
                    : `${perfil.parecidoSelfie ?? 0}% de parecido`}
                </span>
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '8px 0', fontSize: 14 }}
                onClick={() => manejarVerificacion(perfil.uid, 'aprobado')}
                disabled={procesando === perfil.uid}
              >
                Aprobar manualmente
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reportes */}
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>
        Reportes sin revisar {reportesPendientes.length > 0 ? `(${reportesPendientes.length})` : ''}
      </h2>
      {reportesPendientes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 24 }}>
          No hay reportes pendientes.
        </p>
      ) : (
        <div className="stack" style={{ marginBottom: 28 }}>
          {reportesPendientes.map((r) => (
            <div key={r.id} className="chip" style={{ padding: 14 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {nombresCache[r.reportadoPor] || '...'}
                </span>{' '}
                reportó a{' '}
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {nombresCache[r.reportado] || '...'}
                </span>
              </div>
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 12,
                  color: MOTIVO_COLOR[r.motivo] || 'var(--text-dim)',
                  border: `1px solid ${MOTIVO_COLOR[r.motivo] || 'var(--border)'}`,
                  borderRadius: 20,
                  padding: '3px 10px',
                  marginBottom: 10,
                }}
              >
                {r.motivo}
              </div>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', padding: '8px 0', fontSize: 14 }}
                onClick={() => manejarRevisado(r.id)}
                disabled={procesando === r.id}
              >
                Marcar como revisado
              </button>
            </div>
          ))}
        </div>
      )}

      {reportesRevisados.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 4, color: 'var(--text-faint)' }}>
            Ya revisados ({reportesRevisados.length})
          </h2>
          <div className="stack">
            {reportesRevisados.map((r) => (
              <div key={r.id} className="chip" style={{ padding: 14, opacity: 0.5 }}>
                <span style={{ fontWeight: 600 }}>{nombresCache[r.reportadoPor] || '...'}</span>{' '}
                reportó a <span style={{ fontWeight: 600 }}>{nombresCache[r.reportado] || '...'}</span> ·{' '}
                {r.motivo}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
