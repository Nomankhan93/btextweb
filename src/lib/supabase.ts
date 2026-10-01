import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getRuntimeConfig } from './env'

const config = getRuntimeConfig()

export const supabase: SupabaseClient | null = config.supabaseConfigured
  ? createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const supabaseConfigured = config.supabaseConfigured
