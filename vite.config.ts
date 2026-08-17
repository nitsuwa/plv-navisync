import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


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

export default defineConfig(({ mode }) => {
  const loadedEnv = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const publicEnvironmentNames = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_ENABLE_DEMO_LOGIN',
    'VITE_DEMO_ADMIN_EMAIL',
    'VITE_DEMO_ADMIN_PASSWORD',
    'VITE_DEMO_STUDENT_EMAIL',
    'VITE_DEMO_STUDENT_PASSWORD',
  ] as const

  return {
  // Vite's normal envPrefix behavior is prefix-based, not an exact-name
  // allowlist. Disable that broad path and define only these reviewed values.
  envPrefix: 'PLV_BROWSER_EXPLICIT_',
  define: Object.fromEntries(
    publicEnvironmentNames.map((name) => [
      `import.meta.env.${name}`,
      JSON.stringify(loadedEnv[name] ?? ''),
    ]),
  ),
  plugins: [
    figmaAssetResolver(),
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
    force: true,
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
    css: true,
    testTimeout: 10000,
  },
  }
})
