import { describe, expect, it } from 'vitest'
import {
  blockReasonLabel,
  consentStateLabel,
  summarizeEligibility,
  suppressionStateLabel,
  type EligibilityLike,
} from '../lib/consentSuppression'

const rows: EligibilityLike[] = [
  { eligibilityState: 'eligible', blockReason: null },
  { eligibilityState: 'blocked', blockReason: 'no_consent' },
  { eligibilityState: 'blocked', blockReason: 'consent_revoked' },
  { eligibilityState: 'blocked', blockReason: 'consent_expired' },
  { eligibilityState: 'blocked', blockReason: 'suppressed' },
  { eligibilityState: 'blocked', blockReason: 'suppressed' },
]

describe('consent and suppression helpers', () => {
  it('summarizes eligibility reasons without double counting', () => {
    expect(summarizeEligibility(rows)).toEqual({
      total: 6,
      eligible: 1,
      noConsent: 1,
      revoked: 1,
      expired: 1,
      suppressed: 2,
    })
  })

  it('uses human-readable state labels', () => {
    expect(consentStateLabel('none')).toBe('No consent evidence')
    expect(consentStateLabel('granted')).toBe('Consent granted')
    expect(consentStateLabel('revoked')).toBe('Consent revoked')
    expect(consentStateLabel('expired')).toBe('Consent expired')
    expect(suppressionStateLabel('clear')).toBe('Not suppressed')
    expect(suppressionStateLabel('suppressed')).toBe('Suppressed')
  })

  it('explains suppression as the authoritative blocker', () => {
    expect(blockReasonLabel('suppressed')).toMatch(/Suppression list/)
    expect(blockReasonLabel(null)).toMatch(/Consent is active/)
  })
})
