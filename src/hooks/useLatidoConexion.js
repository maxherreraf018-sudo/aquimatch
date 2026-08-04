import { useEffect } from 'react'
import { serverTimestamp } from 'firebase/firestore'
import { escucharEstadoAuth, actualizarUsuario } from '../firebase/auth'

const INTERVALO_LATIDO_CONEXION_MS = 2 * 60 * 1000

/**
 * Late global de "tengo la app abierta ahora mismo", en cualquier pantalla —
 * a diferencia del latido de Descubrir (renovarActividad, en activation.js),
 * que solo corre mientras se está activo en un lugar y sirve para otra cosa
 * (si sigue vigente la presencia física ahí). Este actualiza
 * usuarios/{uid}.ultimaConexion cada par de minutos mientras haya sesión
 * iniciada. Se usa junto con una ventana de 10 minutos para el punto verde
 * de "en línea" en Chats — ver obtenerEstadoConexion en services/chatsList.js.
 */
export default function useLatidoConexion() {
  useEffect(() => {
    let uidActual = null

    function latir() {
      if (uidActual) actualizarUsuario(uidActual, { ultimaConexion: serverTimestamp() })
    }

    // A propósito NO se llama a latir() apenas se detecta la sesión: justo
    // al abrir la app es cuando otras pantallas (Welcome, Auth) están
    // leyendo este mismo documento para decidir a dónde mandar a la
    // persona — escribir en ese instante podía cruzarse con esa lectura.
    // El primer latido espera al primer intervalo.
    const desuscribir = escucharEstadoAuth((usuario) => {
      uidActual = usuario?.uid || null
    })

    const intervalo = setInterval(latir, INTERVALO_LATIDO_CONEXION_MS)

    return () => {
      desuscribir()
      clearInterval(intervalo)
    }
  }, [])
}
