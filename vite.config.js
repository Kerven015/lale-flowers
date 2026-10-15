import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// While developing (npm run dev), requests to /api and /uploads go to the
// shop server (server/ folder, started with: cd server && npm run dev).
// changeOrigin: false keeps the browser's address, so the server's security
// check sees the request coming from this same site.
const SERVER = { target: 'http://127.0.0.1:3000', changeOrigin: false }

export default defineConfig({
  base: '/lale-flowers/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': SERVER,
      '/uploads': SERVER,
    },
  },
})