import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './config'

// Versión de los Términos/Política vigente. Cámbiala cada vez que el texto
// legal tenga un cambio relevante, así queda registrado con qué versión
// exacta aceptó cada usuario.
const VERSION_TERMINOS = '2026-07-27'

// Crear cuenta con correo y contraseña
export async function registrarConCorreo(correo, contrasena) {
  const cred = await createUserWithEmailAndPassword(auth, correo, contrasena)
  await crearDocumentoUsuario(cred.user.uid, { correo: cred.user.email })
  await sendEmailVerification(cred.user)
  return cred.user
}
// Iniciar sesión con correo y contraseña
export async function iniciarSesionConCorreo(correo, contrasena) {
  const cred = await signInWithEmailAndPassword(auth, correo, contrasena)
  return cred.user
}
// Iniciar sesión / registro con Google (versión WEB — usa un popup, solo
// funciona en el navegador, NO dentro de la app empacada con Capacitor).
// A propósito NO crea el documento de usuario acá: si es una cuenta nueva,
// Auth.jsx le pide primero que acepte los Términos antes de crearla (ver
// crearDocumentoUsuario más abajo).
export async function iniciarSesionConGoogle() {
  const cred = await signInWithPopup(auth, googleProvider)
  return cred.user
}
// Iniciar sesión / registro con Google (versión NATIVA — se usa dentro de
// la app empacada de Android/iOS, con el idToken que entrega el plugin
// @codetrix-studio/capacitor-google-auth después de que la persona elige
// su cuenta en el selector nativo de Google).
export async function iniciarSesionConGoogleNativo(idToken) {
  const credencial = GoogleAuthProvider.credential(idToken)
  const cred = await signInWithCredential(auth, credencial)
  return cred.user
}
export async function cerrarSesion() {
  await signOut(auth)
}
export function escucharEstadoAuth(callback) {
  return onAuthStateChanged(auth, callback)
}
// Reenvía el correo de verificación a la cuenta actualmente logueada.
export async function reenviarVerificacionCorreo() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser)
  }
}
// Vuelve a consultarle a Firebase si el correo ya fue verificado.
export async function recargarUsuarioActual() {
  if (!auth.currentUser) return null
  await auth.currentUser.reload()
  return auth.currentUser
}
// Manda un correo con un enlace para crear una contraseña nueva.
export async function recuperarContrasena(correo) {
  await sendPasswordResetEmail(auth, correo)
}
// Crea el documento del usuario en Firestore si no existe todavía. Como
// esta función solo escribe datos la PRIMERA vez (cuenta recién creada),
// y la pantalla de Auth exige tener el checkbox de Términos marcado antes
// de poder llegar hasta acá, este es el momento correcto para dejar
// registrada la aceptación: fecha/hora exacta y qué versión del texto
// legal aceptó.
export async function crearDocumentoUsuario(uid, datosIniciales) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      ...datosIniciales,
      perfilCompleto: false,
      creadoEn: serverTimestamp(),
      aceptoTerminosEn: serverTimestamp(),
      versionTerminos: VERSION_TERMINOS,
    })
  }
}
export async function obtenerUsuario(uid) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}
export async function actualizarUsuario(uid, datos) {
  const ref = doc(db, 'usuarios', uid)
  await setDoc(ref, datos, { merge: true })
}
