export const MESSAGE_TEMPLATE_SYNTAX_VERSION = 'bulktext-template-v1'
export const MESSAGE_TEMPLATE_MAX_CHARACTERS = 4000

export const builtInMessageTokens = ['name', 'first_name', 'last_name', 'phone'] as const
export type BuiltInMessageToken = (typeof builtInMessageTokens)[number]

export interface PersonalizationSourceRow {
  eligibilityRowId: number
  previewRowId: number
  sourceRowNumber: number
  displayName: string | null
  firstName: string | null
  lastName: string | null
  normalizedE164: string
  customFields: Record<string, unknown>
}

export interface TemplateAnalysis {
  tokens: string[]
  malformed: boolean
  unsupportedTokens: string[]
  customKeys: string[]
}

export interface RenderedPersonalization {
  text: string
  missingTokens: string[]
  unsupportedTokens: string[]
  complete: boolean
}

const tokenPattern = /{{\s*([^{}]+?)\s*}}/g

function cleanToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed.startsWith('custom:')) return trimmed
  return `custom:${trimmed.slice(7).trim()}`
}

function isSupportedToken(token: string): boolean {
  if ((builtInMessageTokens as readonly string[]).includes(token)) return true
  if (!token.startsWith('custom:')) return false
  const key = token.slice(7).trim()
  return key.length >= 1 && key.length <= 80 && !key.includes('{') && !key.includes('}')
}

export function extractMessageTokens(template: string): string[] {
  const tokens = new Set<string>()
  for (const match of template.matchAll(tokenPattern)) {
    const token = cleanToken(match[1] ?? '')
    if (token) tokens.add(token)
  }
  return [...tokens].sort((a, b) => a.localeCompare(b))
}

export function analyzeMessageTemplate(template: string): TemplateAnalysis {
  const tokens = extractMessageTokens(template)
  const remainder = template.replace(tokenPattern, '')
  const malformed = remainder.includes('{{') || remainder.includes('}}')
  const unsupportedTokens = tokens.filter((token) => !isSupportedToken(token))
  const customKeys = tokens.filter((token) => token.startsWith('custom:')).map((token) => token.slice(7))
  return { tokens, malformed, unsupportedTokens, customKeys }
}

function scalarToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() ? value : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const rendered = JSON.stringify(value)
    return rendered && rendered !== '{}' && rendered !== '[]' ? rendered : null
  } catch {
    return null
  }
}

export function tokenValue(row: PersonalizationSourceRow, token: string): string | null {
  if (token === 'name') {
    const direct = scalarToText(row.displayName)
    if (direct) return direct
    const joined = [row.firstName, row.lastName].map((value) => scalarToText(value)).filter(Boolean).join(' ').trim()
    return joined || null
  }
  if (token === 'first_name') return scalarToText(row.firstName)
  if (token === 'last_name') return scalarToText(row.lastName)
  if (token === 'phone') return row.normalizedE164
  if (token.startsWith('custom:')) return scalarToText(row.customFields[token.slice(7)])
  return null
}

export function renderPersonalizedMessage(template: string, row: PersonalizationSourceRow): RenderedPersonalization {
  const missing = new Set<string>()
  const unsupported = new Set<string>()
  const text = template.replace(tokenPattern, (_full, rawToken: string) => {
    const token = cleanToken(rawToken)
    if (!isSupportedToken(token)) {
      unsupported.add(token)
      return `⟦unsupported:${token}⟧`
    }
    const value = tokenValue(row, token)
    if (value == null) {
      missing.add(token)
      return `⟦missing:${token}⟧`
    }
    return value
  })
  return {
    text,
    missingTokens: [...missing].sort(),
    unsupportedTokens: [...unsupported].sort(),
    complete: missing.size === 0 && unsupported.size === 0 && !analyzeMessageTemplate(template).malformed,
  }
}

export function discoverCustomFieldKeys(rows: PersonalizationSourceRow[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.customFields ?? {})) {
      const trimmed = key.trim()
      if (trimmed && trimmed.length <= 80) keys.add(trimmed)
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

export function summarizePersonalization(template: string, rows: PersonalizationSourceRow[]) {
  const analysis = analyzeMessageTemplate(template)
  let completeRecipients = 0
  let recipientsWithMissingValues = 0
  let longestRenderedCharacters = 0
  for (const row of rows) {
    const rendered = renderPersonalizedMessage(template, row)
    if (rendered.complete) completeRecipients += 1
    else recipientsWithMissingValues += 1
    longestRenderedCharacters = Math.max(longestRenderedCharacters, rendered.text.length)
  }
  return {
    ...analysis,
    recipientCount: rows.length,
    completeRecipients,
    recipientsWithMissingValues,
    longestRenderedCharacters,
  }
}
