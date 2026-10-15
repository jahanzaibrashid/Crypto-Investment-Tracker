/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_MARKET_DATA_MODE?: 'direct' | 'proxy'
  readonly VITE_COINGECKO_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
