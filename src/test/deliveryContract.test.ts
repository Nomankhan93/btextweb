import { describe, expect, it } from 'vitest'
import { contractNotices, mapContractHealth } from '../lib/deliveryContract'

describe('delivery/recovery contract presentation', () => {
  it('keeps legacy delivery explicitly unverified', () => {
    const notices = contractNotices(mapContractHealth({ legacy_delivery_parts: 2 }))
    expect(notices.join(' ')).toContain('unverified')
    expect(notices.join(' ')).toContain('SENT is distinct from delivery')
  })
  it('shows blocks without suggesting automatic retries', () => {
    expect(contractNotices(mapContractHealth({ blocked_jobs: 3 }))[0]).toContain('no automatic retry')
  })
  it('keeps conflict and operator resolution separate', () => {
    expect(contractNotices(mapContractHealth({ conflicted_attempts: 1 }))[0]).toContain('no-resend resolution stays in effect')
  })
  it('counts retired recovery outcomes without calling them applied', () => {
    const health = mapContractHealth({ recovery_outcomes: { superseded: 2, rejected: 1, applied: 7, pending: 4 } })
    expect(contractNotices(health)[0]).toContain('3 recovery requests')
  })
  it('handles empty health without inventing issues', () => {
    expect(contractNotices(mapContractHealth({}))).toEqual([])
  })
})
