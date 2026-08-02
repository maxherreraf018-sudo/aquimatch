import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { ADMIN_UID } from '../services/admin'

/**
 * Protege el panel de moderación: solo deja pasar a la cuenta definida en
 * ADMIN_UID (services/admin.js). Cualquier otra persona, incluso logueada,
 * es redirigida al inicio sin ver nada del panel.
 */
export default function RequireAdmin({ children }) {
  const [cargando, setCargando] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    const detener = onAuthStateChanged(auth, (usuario) => {
      setEsAdmin(!!usuario && usuario.uid === ADMIN_UID)
      setCargando(false)
    })
    return () => detener()
  }, [])

  if (cargando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Verificando acceso...</p>
      </div>
    )
  }

  if (!esAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}
