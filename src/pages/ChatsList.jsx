import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { escucharMisChats, estaSinLeer, obtenerEstadoConexion } from '../services/chatsList'
import { obtenerPerfilBasico } from '../services/discover'
import BottomNav from '../components/BottomNav'

// Hora/fecha corta para el chat, ej: "14:32" si es hoy, o "27 jul" si no.
function formatearFechaCorta(referencia) {
  if (!referencia) return ''
  const fecha = referencia.toMillis ? referencia.toDate() : new Date(referencia)
  const hoy = new Date()
  const esHoy =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  if (esHoy) return fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export default function ChatsList() {
  const navigate = useNavigate()
  const uid = getAuth().currentUser?.uid
  const [chats, setChats] = useState([])
  const [perfiles, setPerfiles] = useState({})
  const [estadosConexion, setEstadosConexion] = useState({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const detener = escucharMisChats(uid, async (lista) => {
      setChats(lista)
      setCargando(false)
      const faltantes = lista
        .map((c) => c.usuarios.find((u) => u !== uid))
        .filter((otroUid) => otroUid && !perfiles[otroUid])
      for (const otroUid of faltantes) {
        const [perfil, estadoConexion] = await Promise.all([
          obtenerPerfilBasico(otroUid),
          obtenerEstadoConexion(otroUid),
        ])
        setPerfiles((prev) => ({ ...prev, [otroUid]: perfil }))
        setEstadosConexion((prev) => ({ ...prev, [otroUid]: estadoConexion }))
      }
    })
    return () => detener()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Cargando tus chats...</p>
      </div>
    )
  }

  return (
    <div className="screen screen-with-nav">
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Mis chats</h1>
      {chats.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
          <p>Todavía no tienes conversaciones. Cuando conectes con alguien, aparecerá aquí.</p>
        </div>
      ) : (
        <div>
          {chats.map((chat) => {
            const otroUid = chat.usuarios.find((u) => u !== uid)
            const perfil = perfiles[otroUid]
            const estadoConexion = estadosConexion[otroUid] || { activo: false, texto: null }
            const sinLeer = estaSinLeer(chat, uid)
            const hayMensajes = !!chat.ultimoMensajeTexto
            const esMio = chat.ultimoMensajeAutor === uid
            const fecha = formatearFechaCorta(chat.ultimoMensajeEn || chat.creadaEn)

            return (
              <div
                key={chat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 4px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/chat/${chat.id}`)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'var(--gradient)',
                      }}
                    >
                      {perfil?.fotoPrincipal && (
                        <img
                          src={perfil.fotoPrincipal}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      )}
                    </div>
                    {estadoConexion.activo && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 1,
                          right: 1,
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          background: 'var(--success)',
                          border: '2px solid var(--bg)',
                        }}
                      />
                    )}
                  </div>
                  {!estadoConexion.activo && estadoConexion.texto && (
                    <span style={{ fontSize: 9, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                      {estadoConexion.texto.replace('Activo ', '')}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
                      {perfil?.nombre || 'Alguien'}
                    </span>
                    {!hayMensajes && (
                      <span
                        style={{
                          background: 'rgba(255, 210, 122, 0.16)',
                          color: '#FFD27A',
                          fontSize: 9.5,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 6,
                          flexShrink: 0,
                        }}
                      >
                        Nuevo match
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      marginTop: 2,
                      color: sinLeer ? 'var(--text)' : 'var(--text-faint)',
                      fontWeight: sinLeer ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {hayMensajes ? (
                      <>
                        {esMio ? 'Tú: ' : '↩ '}
                        {chat.ultimoMensajeTexto}
                      </>
                    ) : estadoConexion.activo ? (
                      'Activo/a ahora'
                    ) : estadoConexion.texto ? (
                      estadoConexion.texto.replace('Activo', 'Activo/a')
                    ) : (
                      'Toca para saludar'
                    )}
                  </div>
                </div>
                {fecha && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>
                    {fecha}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <BottomNav />
    </div>
  )
}
