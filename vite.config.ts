/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before activating a new version (PwaUpdatePrompt) so an open form is never reloaded away.
      registerType: 'prompt',
      // Registered from React via virtual:pwa-register/react.
      injectRegister: false,
      // Icons and <head> icon links are generated from public/favicon.svg (see pwa-assets.config.ts).
      // theme-color is already managed per theme by index.html.
      pwaAssets: { config: true, overrideManifestIcons: true, injectThemeColor: false },
      manifest: {
        id: '/',
        name: 'Crypto Investment Tracker',
        short_name: 'Crypto Tracker',
        description: 'Track cryptocurrency purchases, sales, and portfolio performance in USD.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#f8fafc',
        categories: ['finance'],
      },
      workbox: {
        // Precache the app shell so it opens instantly and offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // No runtimeCaching on purpose: Supabase and CoinGecko responses (balances, prices)
        // must always come from the network, never from a stale cache.
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
  },
  build: {
    sourcemap: false,
    // SheetJS is ~330 kB and is only loaded on demand when exporting.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/unit/**/*.test.{ts,tsx}', 'src/test/integration/**/*.test.{ts,tsx}', 'src/test/db/**/*.test.ts'],
    css: false,
    clearMocks: true,
    testTimeout: 20_000,
  },
})
