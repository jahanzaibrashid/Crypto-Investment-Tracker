import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, missingEnvVars } from './env'

/**
 * Browser Supabase client. Uses only the public anon key; all authorization is
 * enforced by Row Level Security in the database. Never place the
 * service-role key in a VITE_* variable.
 */
let client: SupabaseClient | null = null

if (missingEnvVars().length === 0) {
  client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(`Supabase is not configured. Missing: ${missingEnvVars().join(', ')}`)
  }
  return client
}

export const isSupabaseConfigured = () => client !== null
