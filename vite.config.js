import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Permite que Vite acepte conexiones desde el túnel de ngrok cuando
    // pruebas la app en tu celular. Si ngrok te da una dirección nueva
    // (cambia cada vez que reinicias el túnel en el plan gratis), agrega
    // esa nueva dirección aquí también.
    allowedHosts: ['happier-manifesto-disregard.ngrok-free.dev'],
  },
})
