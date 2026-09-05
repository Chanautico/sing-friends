/*import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite testar em outro dispositivo (celular) na mesma rede Wi-Fi
    proxy: {
      '/api': { target: 'http://127.0.0.1:3002', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3002', changeOrigin: true },
      // Socket.io usa WebSocket — precisa de `ws: true` no proxy
      '/socket.io': { target: 'http://127.0.0.1:3002', changeOrigin: true, ws: true },
    },
  },
})*/

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permite acesso externo pelo IP da rede (ex: 192.168.18.5)
    port: 5173,
    proxy: {
      // Redireciona chamadas de API para o backend
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Redireciona o Socket.io para o backend (Corrige o erro 400)
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      }
    }
  }
})