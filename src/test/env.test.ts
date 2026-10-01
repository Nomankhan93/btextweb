import { describe, expect, it } from 'vitest'
import { getRuntimeConfig } from '../lib/env'

describe('getRuntimeConfig', () => {
  it('reports Supabase configured only when both values are present', () => {
    const config = getRuntimeConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:56321',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_APP_ENV: 'development',
      BASE_URL: '/',
      MODE: 'test',
      DEV: false,
      PROD: false,
      SSR: false,
    })

    expect(config.supabaseConfigured).toBe(true)
    expect(config.appEnvironment).toBe('development')
  })

  it('does not treat blank values as configured', () => {
    const config = getRuntimeConfig({
      VITE_SUPABASE_URL: ' ',
      VITE_SUPABASE_ANON_KEY: '',
      BASE_URL: '/',
      MODE: 'test',
      DEV: false,
      PROD: false,
      SSR: false,
    })

    expect(config.supabaseConfigured).toBe(false)
    expect(config.supabaseUrl).toBeNull()
  })
})
