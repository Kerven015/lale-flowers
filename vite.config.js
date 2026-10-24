import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// While developing (npm run dev), requests to /api and /uploads go to the
// shop server (server/ folder, started with: cd server && npm run dev).
// changeOrigin: false keeps the browser's address, so the server's security
// check sees the request coming from this same site.
const SERVER = { target: 'http://127.0.0.1:3000', changeOrigin: false }

export default defineConfig({
  // The site's address: "/" for the real shop (your domain, Docker, nginx,
  // npm run dev). The GitHub Pages preview builds with VITE_BASE=/lale-flowers/
  // (.github/workflows/deploy.yml).
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  // npm test (the server has its own tests: cd server && npm test)
  test: { include: ['src/**/*.test.{js,jsx}'] },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': SERVER,
      '/uploads': SERVER,
    },
  },
})