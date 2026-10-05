import { describe, expect, it } from 'vitest'
import { collectPagedRows } from '../lib/pagedRpc'
import { classifyRecipientRows, defaultRecipientSelection, type RecipientValidationRow } from '../lib/recipientPreview'

function pageFetcher<T>(rows: T[]) {
  return async (from: number, to: number) => rows.slice(from, to + 1)
}

function numberedRows(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1)
}

describe('recipient completeness pagination', () => {
  for (const count of [10, 1000, 1001, 1400, 5000]) {
    it(`collects all ${count} rows without a 1000-row truncation`, async () => {
      const source = numberedRows(count)
      await expect(collectPagedRows(pageFetcher(source))).resolves.toEqual(source)
    })
  }

  it('rejects a result that exceeds the 5000-row product limit', async () => {
    await expect(collectPagedRows(pageFetcher(numberedRows(5001)))).rejects.toThrow(/5,000/)
  })

  it('keeps duplicate classification correct across the 1000/1001 boundary', () => {
    const rows: RecipientValidationRow[] = Array.from({ length: 1001 }, (_, index) => {
      const sourceRowNumber = index + 2
      const canonical = index === 999 || index === 1000 ? '+923001234567' : `+92311${String(index).padStart(7, '0')}`
      return {
        importRowId: index + 1,
        sourceRowNumber,
        rawPhone: canonical,
        normalizedE164: canonical,
        phoneValidationStatus: 'valid',
        phoneValidationReason: 'ok',
        firstName: null,
        lastName: null,
        displayName: `Recipient ${index + 1}`,
        customFields: {},
        duplicateGroupSize: index === 999 || index === 1000 ? 2 : 1,
      }
    })
    const selected = defaultRecipientSelection(rows)
    const decisions = classifyRecipientRows(rows, selected)
    expect(selected.has(1000)).toBe(true)
    expect(selected.has(1001)).toBe(false)
    expect(decisions[999].decision).toBe('included')
    expect(decisions[1000].decision).toBe('duplicate_in_file')
  })

  it('requests deterministic 500-row windows and one terminal page', async () => {
    const calls: Array<[number, number]> = []
    const source = numberedRows(1400)
    const result = await collectPagedRows(async (from, to) => {
      calls.push([from, to])
      return source.slice(from, to + 1)
    })
    expect(result).toHaveLength(1400)
    expect(calls).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })
})
