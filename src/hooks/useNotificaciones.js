import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { FirebaseMessaging } from '@capacitor-firebase/messaging'
import { getAuth } from 'firebase/auth'
import { actualizarUsuario } from '../firebase/auth'

/**
 * Pide permiso de notificaciones push (si todavía no se preguntó) y guarda
 * el token del dispositivo en usuarios/{uid}.fcmToken, para que las Cloud
 * Functions (notificarMensajeNuevo, notificarMatchNuevo) sepan a quién
 * avisarle. Si la persona rechaza el permiso, o algo falla (ej. Google
 * Play Services no disponible), la app sigue funcionando normal, solo sin
 * notificaciones — nunca bloquea nada.
 *
 * También escucha cuando alguien toca una notificación y la abre, para
 * llevarla directo a esa conversación.
 */
export default function useNotificaciones() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const uid = getAuth().currentUser?.uid
    if (!uid) return

    let cancelado = false

    async function activar() {
      try {
        let estado = (await FirebaseMessaging.checkPermissions()).receive
        if (estado === 'prompt' || estado === 'prompt-with-rationale') {
          estado = (await FirebaseMessaging.requestPermissions()).receive
        }
        if (estado !== 'granted' || cancelado) return
        const { token } = await FirebaseMessaging.getToken()
        if (token && !cancelado) {
          await actualizarUsuario(uid, { fcmToken: token })
        }
      } catch (err) {
        // Sin notificaciones, pero la app sigue funcionando igual.
      }
    }
    activar()

    const listenerToken = FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      if (token) actualizarUsuario(uid, { fcmToken: token })
    })

    const listenerTap = FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const conexionId = event.notification?.data?.conexionId
      if (conexionId) navigate(`/chat/${conexionId}`)
    })

    return () => {
      cancelado = true
      listenerToken.then((h) => h.remove())
      listenerTap.then((h) => h.remove())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
