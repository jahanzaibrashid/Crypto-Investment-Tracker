import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/** Brand background from public/favicon.svg, so padded icons don't get a white frame. */
const background = '#0f1a33'

/**
 * PWA icons generated at build time from the favicon (vite-plugin-pwa `pwaAssets`):
 * favicon.ico, pwa-64/192/512, a maskable 512 for Android, and a 180 apple-touch-icon.
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/favicon.svg'],
})
