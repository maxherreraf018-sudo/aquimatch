import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import RequireVerificacion from './components/RequireVerificacion'
import useLatidoConexion from './hooks/useLatidoConexion'

// Cada pantalla se carga sola (su propio archivo .js), no todas juntas en un
// solo bundle gigante — así la primera pantalla que ve alguien pesa mucho
// menos, sobre todo importante en redes lentas o celulares viejos.
const Welcome = lazy(() => import('./pages/Welcome'))
const Auth = lazy(() => import('./pages/Auth'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const CreateProfile = lazy(() => import('./pages/CreateProfile'))
const CompleteProfile = lazy(() => import('./pages/CompleteProfile'))
const Activation = lazy(() => import('./pages/Activation'))
const Discover = lazy(() => import('./pages/Discover'))
const ChatsList = lazy(() => import('./pages/ChatsList'))
const MutualMatch = lazy(() => import('./pages/MutualMatch'))
const Chat = lazy(() => import('./pages/Chat'))
const Admin = lazy(() => import('./pages/Admin'))
const Perfil = lazy(() => import('./pages/Perfil'))
const Gold = lazy(() => import('./pages/Gold'))
const Terminos = lazy(() => import('./pages/Terminos'))
const Privacidad = lazy(() => import('./pages/Privacidad'))

function CargandoPantalla() {
  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <p>Cargando...</p>
    </div>
  )
}

export default function App() {
  useLatidoConexion()
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<CargandoPantalla />}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/terminos" element={<Terminos />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route
            path="/verificar-correo"
            element={
              <RequireAuth requiereVerificacion={false}>
                <VerifyEmail />
              </RequireAuth>
            }
          />
          <Route
            path="/crear-perfil"
            element={
              <RequireAuth>
                <CreateProfile />
              </RequireAuth>
            }
          />
          <Route
            path="/completar-perfil"
            element={
              <RequireAuth>
                <CompleteProfile />
              </RequireAuth>
            }
          />
          <Route
            path="/activacion"
            element={
              <RequireAuth>
                <RequireVerificacion>
                  <Activation />
                </RequireVerificacion>
              </RequireAuth>
            }
          />
          <Route
            path="/descubrir"
            element={
              <RequireAuth>
                <RequireVerificacion>
                  <Discover />
                </RequireVerificacion>
              </RequireAuth>
            }
          />
          <Route
            path="/mis-chats"
            element={
              <RequireAuth>
                <ChatsList />
              </RequireAuth>
            }
          />
          <Route
            path="/conexion/:id"
            element={
              <RequireAuth>
                <MutualMatch />
              </RequireAuth>
            }
          />
          <Route
            path="/chat/:id"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
          <Route
            path="/perfil"
            element={
              <RequireAuth>
                <Perfil />
              </RequireAuth>
            }
          />
          <Route
            path="/gold"
            element={
              <RequireAuth>
                <Gold />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
