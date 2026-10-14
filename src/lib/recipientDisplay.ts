export function maskRecipientNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return '—'
  if (digits.length <= 6) return '••••'
  const prefix = value.trim().startsWith('+') && digits.length >= 8 ? `+${digits.slice(0, 2)}` : digits.slice(0, 2)
  const hidden = '•'.repeat(Math.max(4, digits.length - 6))
  return `${prefix}${hidden}${digits.slice(-4)}`
}
