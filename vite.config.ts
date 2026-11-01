import { defineConfig, loadEnv, type Plugin } from 'vite'
import fs from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Stamps public/sw.js with a per-build id and the hashed assets index.html
// loads up front, so the installed app shell opens offline and each deploy
// gets fresh cache buckets without a manual version bump.
function pwaServiceWorkerPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'plv-pwa-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js')
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(swPath) || !fs.existsSync(indexPath)) return
      const html = fs.readFileSync(indexPath, 'utf8')
      const assets = [...new Set(
        [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]),
      )].sort()
      const buildId = createHash('sha256').update(html).digest('hex').slice(0, 12)
      const source = fs.readFileSync(swPath, 'utf8')
        .replace('"__PLV_BUILD_ID__"', JSON.stringify(buildId))
        .replace('/* __PLV_PRECACHE_ASSETS__ */ []', JSON.stringify(assets))
      fs.writeFileSync(swPath, source)
    },
  }
}

function isLocalUrl(value: string): boolean {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const hostname = new URL(candidate).hostname.toLowerCase()
    return hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '[::1]'
  } catch {
    return false
  }
}

function publicAppOrigin(mode: string): string {
  const env = loadEnv(mode, '.', '')
  const explicitUrl = env.VITE_PUBLIC_APP_URL?.trim()
  const vercelEnvironment = env.VERCEL_ENV
  const deploymentUrl = env.VERCEL_URL
  const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL
  const vercelUrl = vercelEnvironment === 'production'
    ? productionUrl || deploymentUrl
    : deploymentUrl || productionUrl
  const isVercelBuild = Boolean(vercelEnvironment || deploymentUrl || productionUrl)
  const explicitIsLocal = explicitUrl ? isLocalUrl(explicitUrl) : false
  const candidate = explicitUrl && (!isVercelBuild || !explicitIsLocal) ? explicitUrl : vercelUrl

  if (!candidate) return ''
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  try {
    return new URL(withProtocol).origin
  } catch {
    return ''
  }
}

export default defineConfig(({ mode }) => ({
  // Worktrees may share node_modules; keep optimizer output local to each checkout.
  cacheDir: path.resolve(__dirname, '.tmp/vite-cache'),
  define: {
    'import.meta.env.VITE_PUBLIC_APP_ORIGIN': JSON.stringify(publicAppOrigin(mode)),
  },
  plugins: [
    figmaAssetResolver(),
    pwaServiceWorkerPlugin(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Scan the shipped application entry only. Verification artifacts and
    // browser profiles also contain HTML that must never be treated as app code.
    entries: ['index.html'],
    include: ['react', 'react-dom', 'react-router'],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework — rarely changes, optimal caching
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router'],
          // Animation library
          'vendor-motion': ['motion'],
          // UI icon library (large)
          'vendor-icons': ['lucide-react'],
          // Charting
          'vendor-charts': ['recharts'],
          // Date utilities
          'vendor-dates': ['date-fns'],
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Vitest configuration
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: [...configDefaults.exclude, '**/.tmp/**'],
    css: true,
    testTimeout: 10000,
  },
}))
