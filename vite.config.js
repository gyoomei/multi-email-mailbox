import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/multi-email-mailbox/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
})
