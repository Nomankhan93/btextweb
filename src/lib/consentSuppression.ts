export type ConsentState = 'none' | 'granted' | 'revoked' | 'expired'
export type SuppressionState = 'clear' | 'suppressed'
export type EligibilityState = 'eligible' | 'blocked'
export type EligibilityBlockReason = 'no_consent' | 'consent_revoked' | 'consent_expired' | 'suppressed' | null

export interface ContactComplianceStatus {
  normalizedE164: string
  consentState: ConsentState
  consentEventId: number | null
  consentSource: string | null
  consentOccurredAt: string | null
  consentExpiresAt: string | null
  suppressionState: SuppressionState
  suppressionEventId: number | null
  suppressionReason: string | null
  suppressionSource: string | null
  suppressionOccurredAt: string | null
  eligibilityState: EligibilityState
  blockReason: EligibilityBlockReason
}

export interface EligibilitySummary {
  total: number
  eligible: number
  noConsent: number
  revoked: number
  expired: number
  suppressed: number
}

export interface EligibilityLike {
  eligibilityState: EligibilityState
  blockReason: EligibilityBlockReason
}

export function summarizeEligibility(rows: EligibilityLike[]): EligibilitySummary {
  return {
    total: rows.length,
    eligible: rows.filter((row) => row.eligibilityState === 'eligible').length,
    noConsent: rows.filter((row) => row.blockReason === 'no_consent').length,
    revoked: rows.filter((row) => row.blockReason === 'consent_revoked').length,
    expired: rows.filter((row) => row.blockReason === 'consent_expired').length,
    suppressed: rows.filter((row) => row.blockReason === 'suppressed').length,
  }
}

export function consentStateLabel(state: ConsentState): string {
  if (state === 'granted') return 'Consent granted'
  if (state === 'revoked') return 'Consent revoked'
  if (state === 'expired') return 'Consent expired'
  return 'No consent evidence'
}

export function suppressionStateLabel(state: SuppressionState): string {
  return state === 'suppressed' ? 'Suppressed' : 'Not suppressed'
}

export function blockReasonLabel(reason: EligibilityBlockReason): string {
  if (reason === 'suppressed') return 'Suppression list blocks this number.'
  if (reason === 'consent_revoked') return 'Latest consent event is revoked.'
  if (reason === 'consent_expired') return 'Latest consent grant has expired.'
  if (reason === 'no_consent') return 'No active consent evidence is recorded.'
  return 'Consent is active and no suppression is present.'
}
