// Configuración de Firebase
import { initializeApp } from 'firebase/app'
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyDs1nixTjDd0UuT5Haft9y9iqicJmWt1sk',
  authDomain: 'mi-app-conexion.firebaseapp.com',
  projectId: 'mi-app-conexion',
  storageBucket: 'mi-app-conexion.firebasestorage.app',
  messagingSenderId: '39224828573',
  appId: '1:39224828573:web:68b8d350c5a7305d672a74',
}

export const app = initializeApp(firebaseConfig)
// getAuth() por sí solo, dentro del WebView de Android que usa Capacitor, a
// veces no detecta bien dónde puede guardar la sesión de forma persistente
// y termina sin recordarla entre cierres completos de la app — por eso se
// especifica a mano (con un respaldo por si el dispositivo no soporta el
// primero).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)
export const googleProvider = new GoogleAuthProvider()