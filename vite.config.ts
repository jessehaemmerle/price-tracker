import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Im Dev-Server die Scraper-Ausgabe aus ./data unter /data/ ausliefern.
 * Im Build kopiert der Deploy-Workflow den Daten-Branch nach dist/data.
 */
function localData(): Plugin {
  const root = resolve(process.env.DATA_DIR ?? 'data')
  return {
    name: 'local-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '')
        const file = join(root, rel)
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
          // Wie GitHub Pages: fehlende Datei = 404 (nicht die SPA-Startseite)
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), localData()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
