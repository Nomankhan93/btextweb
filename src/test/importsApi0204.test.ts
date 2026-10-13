import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedImportFile } from '../lib/importFiles'
import type { ImportColumnMapping, ImportPreviewRow } from '../lib/importMapping'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { rpc },
}))

import { CONTACT_IMPORT_BATCH_ROWS, createContactImport } from '../lib/importsApi'

const file: ParsedImportFile = {
  fileName: 'recipients.xlsx',
  fileType: 'xlsx',
  fileSizeBytes: 12 * 1024 * 1024,
  fileSha256: 'a'.repeat(64),
  sheetName: 'Recipients',
  headers: ['Name', 'Mobile'],
  rows: [],
  sourceRowCount: 0,
  truncated: false,
}

const mapping: ImportColumnMapping = {
  phone: 'Mobile',
  firstName: null,
  lastName: null,
  displayName: 'Name',
}

function rows(count: number): ImportPreviewRow[] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRowNumber: index + 2,
    rawData: { Name: `Recipient ${index + 1}`, Mobile: `0300${String(index).padStart(7, '0')}` },
    rawPhone: `0300${String(index).padStart(7, '0')}`,
    firstName: null,
    lastName: null,
    displayName: `Recipient ${index + 1}`,
    customFields: {},
    normalization: {
      rawInput: `0300${String(index).padStart(7, '0')}`,
      normalizedE164: `+92300${String(index).padStart(7, '0')}`,
      countryIso: 'PK',
      countryCallingCode: '92',
      nationalNumber: `300${String(index).padStart(7, '0')}`,
      numberType: 'mobile',
      validationStatus: 'valid',
      validationReason: '',
      normalizationVersion: 'pk-mobile-v1',
    },
    duplicateInFile: false,
  }))
}

describe('0.20.4 batched contact import staging', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('stages a large import in bounded batches before finalizing', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'begin_contact_import') return { data: 'import-1', error: null }
      if (name === 'append_contact_import_rows') return { data: 250, error: null }
      if (name === 'finalize_contact_import') return { data: 'import-1', error: null }
      return { data: null, error: null }
    })
    const progress: Array<{ phase: string; completedRows: number }> = []
    const stagedRows = rows(501)

    await expect(createContactImport('org-1', { ...file, sourceRowCount: stagedRows.length }, mapping, stagedRows, {
      onProgress: (value) => progress.push({ phase: value.phase, completedRows: value.completedRows }),
    })).resolves.toBe('import-1')

    const appendCalls = rpc.mock.calls.filter(([name]) => name === 'append_contact_import_rows')
    expect(CONTACT_IMPORT_BATCH_ROWS).toBe(250)
    expect(appendCalls).toHaveLength(3)
    expect(appendCalls.map(([, args]) => (args.p_rows as unknown[]).length)).toEqual([250, 250, 1])
    expect(rpc.mock.calls.filter(([name]) => name === 'begin_contact_import')).toHaveLength(1)
    expect(rpc.mock.calls.filter(([name]) => name === 'finalize_contact_import')).toHaveLength(1)
    expect(progress).toContainEqual({ phase: 'staging', completedRows: 501 })
    expect(progress.at(-1)).toEqual({ phase: 'finalizing', completedRows: 501 })
  })

  it('aborts and cleans up an incomplete staging session', async () => {
    const controller = new AbortController()
    rpc.mockImplementation(async (name: string) => {
      if (name === 'begin_contact_import') return { data: 'import-cancel', error: null }
      if (name === 'append_contact_import_rows') return { data: 250, error: null }
      if (name === 'abort_contact_import') return { data: true, error: null }
      return { data: null, error: null }
    })

    const promise = createContactImport('org-1', file, mapping, rows(501), {
      signal: controller.signal,
      onProgress: (value) => {
        if (value.phase === 'staging' && value.completedRows === 250) controller.abort()
      },
    })

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(rpc.mock.calls.filter(([name]) => name === 'append_contact_import_rows')).toHaveLength(1)
    expect(rpc.mock.calls.filter(([name]) => name === 'finalize_contact_import')).toHaveLength(0)
    expect(rpc.mock.calls.filter(([name]) => name === 'abort_contact_import')).toHaveLength(1)
  })
})
