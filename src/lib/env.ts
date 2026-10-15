export type MarketDataMode = 'direct' | 'proxy'

export interface AppEnv {
  supabaseUrl: string | undefined
  supabaseAnonKey: string | undefined
  marketDataMode: MarketDataMode
  coingeckoApiKey: string | undefined
}

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export const env: AppEnv = {
  supabaseUrl: clean(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: clean(import.meta.env.VITE_SUPABASE_ANON_KEY),
  marketDataMode: clean(import.meta.env.VITE_MARKET_DATA_MODE) === 'proxy' ? 'proxy' : 'direct',
  coingeckoApiKey: clean(import.meta.env.VITE_COINGECKO_API_KEY),
}

/** Names of required variables that are not configured. */
export function missingEnvVars(e: AppEnv = env): string[] {
  const missing: string[] = []
  if (!e.supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!e.supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  return missing
}
