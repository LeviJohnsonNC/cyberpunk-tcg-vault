import { readFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const preview = process.env.VERCEL_ENV === 'preview'
const quoteDate = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'vault-terms-prices',
    async transformIndexHtml(html, { path }) {
      if (path !== '/terms.html') return html
      const { updatedAt, fx: { usdToCad } } = JSON.parse(await readFile(new URL('./src/data/prices.json', import.meta.url), 'utf8'))
      const date = quoteDate.format(new Date(updatedAt))
      return html.replace('<!-- price-snapshot -->', `<p class="muted">1 USD = ${usdToCad.toFixed(4)} CAD. Prices updated ${date} (UTC).</p>`)
    },
  }],
  // Isolated QA page is emitted only to Vercel previews, never production.
  build: { rollupOptions: { input: { app: 'index.html', terms: 'terms.html', ...(preview ? { campaignQA: 'campaign-preview.html' } : {}) } } },
  define: {
    'import.meta.env.VAULT_PLAY_PREVIEW': JSON.stringify(preview),
  },
})
