export interface DeliveryContractHealth {
  dispatchBlockReason: string | null
  blockedJobs: number
  conflictedAttempts: number
  legacyDeliveryParts: number
  blockReasons: { code: string; jobs: number }[]
  recoveryOutcomes: Record<string, number>
}

export function mapContractHealth(row: Record<string, unknown>): DeliveryContractHealth {
  const count = (value: unknown) => Math.max(0, Number(value) || 0)
  return {
    dispatchBlockReason: typeof row.dispatch_block_reason === 'string' ? row.dispatch_block_reason : null,
    blockedJobs: count(row.blocked_jobs),
    conflictedAttempts: count(row.conflicted_attempts),
    legacyDeliveryParts: count(row.legacy_delivery_parts),
    blockReasons: Array.isArray(row.block_reasons) ? row.block_reasons.map((item: { code: string; jobs: unknown }) => ({ code: item.code, jobs: count(item.jobs) })) : [],
    recoveryOutcomes: Object.fromEntries(Object.entries((row.recovery_outcomes ?? {}) as Record<string, unknown>).map(([key, value]) => [key, count(value)])),
  }
}

export function contractNotices(health: DeliveryContractHealth): string[] {
  const notices: string[] = []
  if (health.dispatchBlockReason) notices.push(`Queue held by exact-SIM checks: ${health.dispatchBlockReason}`)
  if (health.blockedJobs) notices.push(`${health.blockedJobs} jobs blocked by pre-send checks. Review consent, suppression or segment count; no automatic retry is authorized.`)
  if (health.conflictedAttempts) notices.push(`${health.conflictedAttempts} attempts contain conflicting callbacks. Evidence remains UNKNOWN; an existing no-resend resolution stays in effect.`)
  if (health.legacyDeliveryParts) notices.push(`${health.legacyDeliveryParts} parts have unverified delivery callbacks. SENT is distinct from delivery; verified reporting requires the Android v2 contract.`)
  const retired = (health.recoveryOutcomes.superseded ?? 0) + (health.recoveryOutcomes.rejected ?? 0)
  if (retired) notices.push(`${retired} recovery requests are closed as superseded or rejected. They no longer occupy the pending queue.`)
  return notices
}
