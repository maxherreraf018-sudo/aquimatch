import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getAuth } from 'firebase/auth'
import { escucharMisChats, estaSinLeer } from '../services/chatsList'
function IconDescubrir() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" opacity="0.5" />
    </svg>
  )
}
function IconChats() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
function IconEstado() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C7.86 2 4.5 5.36 4.5 9.5C4.5 15.1 12 22 12 22C12 22 19.5 15.1 19.5 9.5C19.5 5.36 16.14 2 12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
function IconPerfil() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
const TABS = [
  { to: '/activacion', label: 'Estado', Icon: IconEstado },
  { to: '/descubrir', label: 'Descubrir', Icon: IconDescubrir },
  { to: '/mis-chats', label: 'Chats', Icon: IconChats },
  { to: '/perfil', label: 'Perfil', Icon: IconPerfil },
]
export default function BottomNav() {
  const uid = getAuth().currentUser?.uid
  const [chats, setChats] = useState([])
  useEffect(() => {
    if (!uid) return
    const detener = escucharMisChats(uid, setChats)
    return () => detener()
  }, [uid])
  const noLeidos = chats.filter((c) => estaSinLeer(c, uid)).length
  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => 'bottom-nav-item' + (isActive ? ' active' : '')}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Icon />
            {label === 'Chats' && noLeidos > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -8,
                  background: 'var(--magenta)',
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 700,
                  minWidth: 15,
                  height: 15,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 0 0 2px #0D0D14',
                }}
              >
                {noLeidos > 9 ? '9+' : noLeidos}
              </span>
            )}
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
