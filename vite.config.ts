import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VAULT_PLAY_PREVIEW': JSON.stringify(process.env.VERCEL_ENV === 'preview'),
  },
})
