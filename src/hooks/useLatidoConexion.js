import { useEffect } from 'react'
import { serverTimestamp } from 'firebase/firestore'
import { escucharEstadoAuth, actualizarUsuario } from '../firebase/auth'

const INTERVALO_LATIDO_CONEXION_MS = 2 * 60 * 1000

// Cuánto esperar antes del PRIMER latido — tiene que ser mayor a cero (para
// no cruzarse con la lectura de Welcome/Auth justo al abrir, que fue el bug
// original), pero mucho menor a los 2 minutos del intervalo normal. Sin
// esto, cualquier sesión corta (abrir la app, mirar algo, cerrarla antes de
// los 2 min) nunca dejaba guardado ni un solo latido — eso hacía que
// testers que sí habían usado la app y hablado por chat aparecieran como si
// nunca se hubieran conectado.
const RETRASO_PRIMER_LATIDO_MS = 8 * 1000

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
    // El primer latido espera un poco (RETRASO_PRIMER_LATIDO_MS), no los 2
    // minutos completos del intervalo normal.
    const desuscribir = escucharEstadoAuth((usuario) => {
      uidActual = usuario?.uid || null
    })

    const primerLatido = setTimeout(latir, RETRASO_PRIMER_LATIDO_MS)
    const intervalo = setInterval(latir, INTERVALO_LATIDO_CONEXION_MS)

    return () => {
      desuscribir()
      clearTimeout(primerLatido)
      clearInterval(intervalo)
    }
  }, [])
}
