import { useEffect, useState } from 'react'
export function SyncFreshness({ lastSuccessAt, nextRetryAt }: { lastSuccessAt: number | null; nextRetryAt: number | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!lastSuccessAt && !nextRetryAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [lastSuccessAt, nextRetryAt])
  return <small className="muted-copy">
    {lastSuccessAt ? ` Last updated ${Math.max(0, Math.floor((now - lastSuccessAt) / 1000))} seconds ago.` : ' No successful update yet.'}
    {nextRetryAt ? ` Retry in ${Math.max(0, Math.ceil((nextRetryAt - now) / 1000))} seconds.` : ''}
  </small>
}
