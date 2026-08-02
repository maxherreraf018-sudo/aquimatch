import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { escucharEstadoAuth, recargarUsuarioActual } from '../firebase/auth'

// requiereVerificacion=false se usa SOLO en la propia pantalla de
// verificación, para no generar un bucle infinito de redirecciones.
export default function RequireAuth({ children, requiereVerificacion = true }) {
  const [usuario, setUsuario] = useState(undefined) // undefined = cargando, null = sin sesión
  const [revisando, setRevisando] = useState(true)
  const yaReviso = useRef(false)

  useEffect(() => {
    const desuscribir = escucharEstadoAuth((u) => {
      setUsuario(u)
      yaReviso.current = false
    })
    return () => desuscribir()
  }, [])

  // Antes de mandar a alguien a la pantalla de "verifica tu correo", le
  // preguntamos una vez a Firebase si ya se verificó — por si lo hizo en
  // otra pestaña, en el navegador del celular, o en una sesión anterior,
  // sin volver a tocar el botón "Ya hice clic en el enlace". Así evitamos
  // mandarla a esa pantalla sin necesidad.
  useEffect(() => {
    if (!usuario) {
      setRevisando(false)
      return
    }
    const esCuentaDeCorreo = usuario.providerData?.some((p) => p.providerId === 'password')
    if (!requiereVerificacion || !esCuentaDeCorreo || usuario.emailVerified || yaReviso.current) {
      setRevisando(false)
      return
    }
    yaReviso.current = true
    recargarUsuarioActual().then((actualizado) => {
      setUsuario(actualizado)
      setRevisando(false)
    })
  }, [usuario, requiereVerificacion])

  if (usuario === undefined || revisando) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p>Cargando...</p>
      </div>
    )
  }
  if (usuario === null) {
    return <Navigate to="/auth" replace />
  }
  const esCuentaDeCorreo = usuario.providerData?.some((p) => p.providerId === 'password')
  if (requiereVerificacion && esCuentaDeCorreo && !usuario.emailVerified) {
    return <Navigate to="/verificar-correo" replace />
  }
  return children
}
