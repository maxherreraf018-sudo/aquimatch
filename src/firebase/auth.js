import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, googleProvider, functions } from './config'

// Los correos de autenticación ya no los manda Firebase: salían desde su
// dominio compartido y caían en spam en Gmail y en Hotmail, con el enlace
// desactivado. Ahora los envía una función propia desde noreply@aquimatch.cl.
const pedirCorreoVerificacion = httpsCallable(functions, 'enviarVerificacionCorreo')
const pedirRestablecerContrasena = httpsCallable(functions, 'enviarRestablecerContrasena')

// Versión de los Términos/Política vigente. Cámbiala cada vez que el texto
// legal tenga un cambio relevante, así queda registrado con qué versión
// exacta aceptó cada usuario.
const VERSION_TERMINOS = '2026-08-17'

// Crear cuenta con correo y contraseña
export async function registrarConCorreo(correo, contrasena) {
  const cred = await createUserWithEmailAndPassword(auth, correo, contrasena)
  await crearDocumentoUsuario(cred.user.uid, { correo: cred.user.email })
  await pedirCorreoVerificacion()
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
// ---------------------------------------------------------------------------
// Sign in with Apple
//
// Apple lo exige (regla 4.8): si la app ofrece un login de terceros —el de
// Google, en este caso— tiene que ofrecer también otro que limite los datos a
// nombre y correo y que permita ocultar el correo. El login con correo y
// contraseña NO sirve como reemplazo, porque no permite ocultar la dirección.
// Por no tenerlo, la versión 1.0 fue rechazada el 2026-08-19.
// ---------------------------------------------------------------------------

// Versión NATIVA (dentro de la app empacada de iOS).
//
// `rawNonce` es el nonce SIN hashear. A Apple se le manda el SHA-256 de ese
// valor, y Apple lo copia dentro del token; Firebase recibe el original, lo
// vuelve a hashear y compara. Si se le pasara el mismo valor a los dos, la
// comparación fallaría y el inicio de sesión sería rechazado — y solo se
// notaría en un iPhone real, nunca en el navegador.
export async function iniciarSesionConAppleNativo(idToken, rawNonce) {
  const proveedor = new OAuthProvider('apple.com')
  const credencial = proveedor.credential({ idToken, rawNonce })
  const cred = await signInWithCredential(auth, credencial)
  return cred.user
}

// Versión WEB (solo para probar en el navegador durante el desarrollo).
export async function iniciarSesionConApple() {
  const proveedor = new OAuthProvider('apple.com')
  proveedor.addScope('email')
  proveedor.addScope('name')
  const cred = await signInWithPopup(auth, proveedor)
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
    await pedirCorreoVerificacion()
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
  await pedirRestablecerContrasena({ correo })
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
    // Los campos privados (hoy solo el correo) se separan acá mismo, para que
    // ningún camino de registro los deje por error en el documento público.
    const publicos = { ...datosIniciales }
    const privados = {}
    CAMPOS_PRIVADOS.forEach((campo) => {
      if (publicos[campo] !== undefined) {
        privados[campo] = publicos[campo]
        delete publicos[campo]
      }
    })
    await setDoc(ref, {
      ...publicos,
      perfilCompleto: false,
      creadoEn: serverTimestamp(),
      aceptoTerminosEn: serverTimestamp(),
      versionTerminos: VERSION_TERMINOS,
    })
    if (Object.keys(privados).length > 0) await guardarDatosPrivados(uid, privados)
  }
}
// A propósito lee siempre del servidor (no del caché local): esta función
// decide a qué pantalla mandar a alguien justo después de iniciar sesión
// (perfil completo, verificado, etc.), un momento en el que puede haber
// otra escritura al mismo documento cruzándose (por ejemplo, el latido de
// useLatidoConexion) — con el caché local, esa carrera podía devolver una
// versión parcial del documento y mandar a alguien con perfil completo de
// vuelta a "Cuéntanos de ti" como si fuera nuevo.
export async function obtenerUsuario(uid) {
  const ref = doc(db, 'usuarios', uid)
  const snap = await getDocFromServer(ref)
  return snap.exists() ? snap.data() : null
}
export async function actualizarUsuario(uid, datos) {
  const ref = doc(db, 'usuarios', uid)
  await setDoc(ref, datos, { merge: true })
}

// ---------------------------------------------------------------------------
// Datos privados del usuario
//
// El documento `usuarios/{uid}` lo puede LEER cualquiera que conozca ese uid
// — y el uid queda a la vista de todos los que estén activados en el mismo
// lugar que vos, porque viene dentro de cada activación. O sea: cualquiera
// que alguna vez estuvo en el mismo bar podía leer tu selfie de verificación
// y el nombre y teléfono de tu contacto de confianza (que ni siquiera es
// usuario de la app y nunca consintió nada).
//
// Por eso esos campos viven en `usuarios/{uid}/privado/datos`, una
// subcolección que las reglas restringen a su dueño y al panel de moderación.
// El documento público solo conserva lo que los demás necesitan ver: nombre,
// fotos, edad, intereses.
// ---------------------------------------------------------------------------

// Campos que NUNCA deben quedar en el documento público.
// Campos que NO pueden vivir en el documento público, porque ese documento lo
// puede leer cualquiera que conozca el uid — y el uid queda a la vista de
// todos los que estén activados en el mismo lugar que tú.
//
// Los tres últimos se agregaron el 2026-09-04:
//   - fechaNacimiento: la fecha exacta es un dato de identidad que sirve para
//     suplantar a alguien. A los demás les basta la edad, que se publica
//     aparte en `edad`.
//   - fcmToken: identifica tu teléfono. Con él, cualquiera que lo leyera
//     podría intentar mandarte notificaciones directamente.
//   - bloqueados: dice con quién tuviste un problema. No le incumbe a nadie
//     más, y menos a la persona bloqueada.
export const CAMPOS_PRIVADOS = [
  'correo',
  'selfieVerificacion',
  'contactoConfianza',
  'fechaNacimiento',
  'fcmToken',
  'bloqueados',
]

/**
 * Guarda la fecha de nacimiento, que va SOLO a los datos privados.
 *
 * La edad que ven los demás (`edad`, en el documento público) NO se escribe
 * desde acá: la calcula y la guarda el servidor, en activarEnLugar. Si la
 * escribiera el cliente, cualquiera se pondría la edad que quisiera, y hasta
 * ahora eso no se podía — las reglas congelan la fecha al terminar el registro.
 *
 * Que la escriba el servidor al activarse tampoco deja huecos: solo aparecés
 * ante otras personas estando activo, así que para cuando alguien te ve, la
 * edad ya está puesta y al día.
 */
export async function guardarFechaNacimiento(uid, fechaNacimiento) {
  await guardarDatosPrivados(uid, { fechaNacimiento })
}

function refDatosPrivados(uid) {
  return doc(db, 'usuarios', uid, 'privado', 'datos')
}

export async function obtenerDatosPrivados(uid) {
  const snap = await getDoc(refDatosPrivados(uid))
  return snap.exists() ? snap.data() : null
}

export async function guardarDatosPrivados(uid, datos) {
  await setDoc(refDatosPrivados(uid), datos, { merge: true })
}

// Migración automática, una sola vez por usuario: las cuentas creadas antes
// del 2026-08-14 tienen estos campos en el documento público. La primera vez
// que la persona entra, se copian a la subcolección privada y se borran del
// público. Se hace acá y no con un script aparte porque cada usuario solo
// tiene permiso para escribir su propio documento.
async function migrarDatosPrivadosSiHaceFalta(uid, datosPublicos) {
  const presentes = CAMPOS_PRIVADOS.filter((campo) => datosPublicos?.[campo] !== undefined)
  if (presentes.length === 0) return
  const aGuardar = {}
  const aBorrar = {}
  presentes.forEach((campo) => {
    aGuardar[campo] = datosPublicos[campo]
    aBorrar[campo] = deleteField()
  })
  // Primero se copia y después se borra: si algo falla en el medio, el dato
  // queda duplicado (recuperable) en vez de perdido.
  await guardarDatosPrivados(uid, aGuardar)
  await setDoc(doc(db, 'usuarios', uid), aBorrar, { merge: true })
}

/**
 * Perfil PROPIO, ya combinado con sus datos privados. Usar esta función (y no
 * obtenerUsuario) siempre que se necesite la selfie, el contacto de confianza
 * o el correo — obtenerUsuario sirve para leer el perfil público de OTRA
 * persona, que nunca incluye nada de eso.
 */
export async function obtenerUsuarioPropio(uid) {
  const publico = await obtenerUsuario(uid)
  if (!publico) return null

  // Ni la migración ni la lectura de los datos privados pueden tumbar la
  // carga del perfil. Antes esto era una sola lectura; ahora hay dos
  // escrituras de por medio, y quien llama (por ejemplo el iniciar() de
  // Descubrir) no siempre tiene try/catch: si esto lanzara, la pantalla se
  // quedaría cargando para siempre. Prefiero mostrar el perfil sin el
  // contacto de confianza y reintentar la próxima vez.
  let privados = {}
  try {
    await migrarDatosPrivadosSiHaceFalta(uid, publico)
    privados = (await obtenerDatosPrivados(uid)) || {}
  } catch (err) {
    // Si la migración no alcanzó a correr, los campos viejos pueden seguir en
    // el documento público; se usan como respaldo para no dejar a la persona
    // sin su propio contacto de confianza.
    CAMPOS_PRIVADOS.forEach((campo) => {
      if (publico[campo] !== undefined) privados[campo] = publico[campo]
    })
  }

  const soloPublico = { ...publico }
  CAMPOS_PRIVADOS.forEach((campo) => delete soloPublico[campo])
  return { ...soloPublico, ...privados }
}
