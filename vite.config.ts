import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Isolated QA page is emitted only to Vercel previews, never production.
  build: process.env.VERCEL_ENV === 'preview' ? { rollupOptions: { input: { app: 'index.html', campaignQA: 'campaign-preview.html' } } } : undefined,
  define: {
    'import.meta.env.VAULT_PLAY_PREVIEW': JSON.stringify(process.env.VERCEL_ENV === 'preview'),
  },
})
