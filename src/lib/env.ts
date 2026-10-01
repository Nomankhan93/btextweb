export type AppEnvironment = 'development' | 'staging' | 'production'

export interface RuntimeConfig {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  appEnvironment: AppEnvironment
  supabaseConfigured: boolean
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getRuntimeConfig(env: ImportMetaEnv = import.meta.env): RuntimeConfig {
  const supabaseUrl = clean(env.VITE_SUPABASE_URL)
  const supabaseAnonKey = clean(env.VITE_SUPABASE_ANON_KEY)
  const appEnvironment = env.VITE_APP_ENV ?? 'development'

  return {
    supabaseUrl,
    supabaseAnonKey,
    appEnvironment,
    supabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  }
}
