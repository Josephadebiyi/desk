import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run server:dev` runs the API on :8787; the web app calls it through this proxy.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
})
