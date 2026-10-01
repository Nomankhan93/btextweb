interface SupabaseLikeError {
  message?: unknown
  details?: unknown
  hint?: unknown
  code?: unknown
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

export function errorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof Error) {
    return reason.message.trim() || fallback
  }

  if (reason && typeof reason === 'object') {
    const candidate = reason as SupabaseLikeError
    const message = nonEmptyText(candidate.message)
    const details = nonEmptyText(candidate.details)
    const hint = nonEmptyText(candidate.hint)
    const code = nonEmptyText(candidate.code)

    const parts: string[] = []
    if (message) parts.push(message)
    if (details && details !== message) parts.push(details)
    if (hint && hint !== message && hint !== details) parts.push(`Hint: ${hint}`)

    if (parts.length) {
      return code ? `${parts.join(' — ')} [${code}]` : parts.join(' — ')
    }
  }

  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return fallback
}
