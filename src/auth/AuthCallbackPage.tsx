import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoadingState } from '../components/StateViews'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) {
      navigate('/auth/login', { replace: true })
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      navigate(data.session ? '/dashboard' : '/auth/login', { replace: true })
    })
  }, [navigate])

  return <LoadingState label="Completing authentication…" />
}
