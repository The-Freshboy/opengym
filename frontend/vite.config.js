import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
    }
  },
  // Routes and sheets are lazy-loaded. The largest remaining file is the optional Hindi
  // exercise-instruction pack (loaded only after choosing Hindi), so keep the warning just
  // above that generated data file while still catching growth in the startup bundle.
  build: { chunkSizeWarningLimit: 1600 }
})
