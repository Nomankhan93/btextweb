export type ImportFileType = 'csv' | 'xlsx'

export interface ParsedImportRow {
  sourceRowNumber: number
  values: Record<string, string>
}

export interface ParsedImportFile {
  fileName: string
  fileType: ImportFileType
  fileSizeBytes: number
  fileSha256: string
  sheetName: string | null
  headers: string[]
  rows: ParsedImportRow[]
  sourceRowCount: number
  truncated: boolean
}

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_COLUMNS = 100

const textDecoder = new TextDecoder('utf-8')

function normalizeHeader(value: string, index: number, seen: Map<string, number>): string {
  const base = value.trim() || `Column ${index + 1}`
  const key = base.toLocaleLowerCase()
  const count = (seen.get(key) ?? 0) + 1
  seen.set(key, count)
  return count === 1 ? base : `${base} (${count})`
}

function isBlankRow(values: string[]): boolean {
  return values.every((value) => value.trim() === '')
}

function matrixToParsedRows(matrix: string[][], options: {
  fileName: string
  fileType: ImportFileType
  fileSizeBytes: number
  fileSha256: string
  sheetName: string | null
}, sourceRowNumbers?: number[]): ParsedImportFile {
  const meaningful = matrix
    .map((row, index) => ({ row, sourceRowNumber: sourceRowNumbers?.[index] ?? index + 1 }))
    .filter(({ row }) => !isBlankRow(row))
  if (meaningful.length === 0) throw new Error('The import file is empty.')

  const phoneHeaderHints = /^(phone|phone no|phone number|mobile|mobile no|mobile number|cell|cell no|contact|contact no|contact number|whatsapp|whatsapp no|number|recipient|msisdn)$/i
  const candidateHeaderIndex = meaningful.slice(0, 20).findIndex(({ row }) =>
    row.some((value) => phoneHeaderHints.test(value.trim().replace(/[^a-z0-9]+/gi, ' ').trim())),
  )
  const headerIndex = candidateHeaderIndex >= 0 ? candidateHeaderIndex : 0
  const headerRow = meaningful[headerIndex]

  const seen = new Map<string, number>()
  const headerWidth = Math.min(headerRow.row.length, MAX_IMPORT_COLUMNS)
  const rawHeaders = Array.from({ length: headerWidth }, (_, index) => headerRow.row[index] ?? '')
  const headers = rawHeaders.map((value, index) => normalizeHeader(value, index, seen))
  if (headers.length === 0) throw new Error('The import file does not contain a header row.')

  const dataRows = meaningful.slice(headerIndex + 1)
  const limitedRows = dataRows.slice(0, MAX_IMPORT_ROWS)
  const rows: ParsedImportRow[] = limitedRows.map(({ row, sourceRowNumber }) => {
    const values: Record<string, string> = {}
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      values[headers[columnIndex]] = row[columnIndex] ?? ''
    }
    return { sourceRowNumber, values }
  })

  return {
    ...options,
    headers,
    rows,
    sourceRowCount: dataRows.length,
    truncated: dataRows.length > MAX_IMPORT_ROWS,
  }
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false
  let count = 0
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && char === delimiter) count += 1
  }
  return count
}

export function detectCsvDelimiter(text: string): ',' | ';' | '\t' {
  const candidates = [',', ';', '\t'] as const
  const sampleLines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).slice(0, 5)
  if (sampleLines.length === 0) return ','

  let best: { delimiter: ',' | ';' | '\t'; score: number } = { delimiter: ',', score: -1 }
  for (const delimiter of candidates) {
    const counts = sampleLines.map((line) => countDelimiterOutsideQuotes(line, delimiter))
    const nonZero = counts.filter((count) => count > 0)
    if (nonZero.length === 0) continue
    const consistency = nonZero.every((count) => count === nonZero[0]) ? 10 : 0
    const score = nonZero.length * 100 + consistency + nonZero.reduce((sum, count) => sum + count, 0)
    if (score > best.score) best = { delimiter, score }
  }
  return best.delimiter
}

export function parseDelimitedText(text: string, delimiter: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

export function parseCsvText(text: string, options: {
  fileName?: string
  fileSizeBytes?: number
  fileSha256?: string
} = {}): ParsedImportFile {
  const delimiter = detectCsvDelimiter(text)
  const matrix = parseDelimitedText(text, delimiter)
  return matrixToParsedRows(matrix, {
    fileName: options.fileName ?? 'import.csv',
    fileType: 'csv',
    fileSizeBytes: options.fileSizeBytes ?? new TextEncoder().encode(text).byteLength,
    fileSha256: options.fileSha256 ?? '',
    sheetName: null,
  })
}

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  localHeaderOffset: number
}

function zipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const minimum = Math.max(0, bytes.length - 65557)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid XLSX archive: ZIP directory was not found.')

  const entriesCount = u16(view, eocd + 10)
  let offset = u32(view, eocd + 16)
  const entries = new Map<string, ZipEntry>()

  for (let index = 0; index < entriesCount; index += 1) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('Invalid XLSX archive: central-directory entry is malformed.')
    const compressionMethod = u16(view, offset + 10)
    const compressedSize = u32(view, offset + 20)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const localHeaderOffset = u32(view, offset + 42)
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, '/')
    entries.set(name, { name, compressionMethod, compressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const offset = entry.localHeaderOffset
  if (u32(view, offset) !== 0x04034b50) throw new Error(`Invalid XLSX archive: local header for ${entry.name} is malformed.`)
  const nameLength = u16(view, offset + 26)
  const extraLength = u16(view, offset + 28)
  const start = offset + 30 + nameLength + extraLength
  const compressed = bytes.slice(start, start + entry.compressedSize)

  if (entry.compressionMethod === 0) return compressed
  if (entry.compressionMethod !== 8) throw new Error(`Unsupported XLSX compression method ${entry.compressionMethod}.`)
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress XLSX files. Use CSV or a modern Chromium browser.')

  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

function attribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return match ? decodeXml(match[1]) : null
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = []
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const text = Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (item) => decodeXml(item[1])).join('')
    values.push(text)
  }
  return values
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase()
  if (!letters) return -1
  let result = 0
  for (const letter of letters) result = result * 26 + (letter.charCodeAt(0) - 64)
  return result - 1
}

function parseWorksheet(xml: string, sharedStrings: string[]): { rows: string[][]; rowNumbers: number[] } {
  const rows: string[][] = []
  const rowNumbers: number[] = []
  let blankRun = 0
  let lastRowNumber = 0
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    const rowNumberText = attribute(rowMatch[1], 'r')
    const rowNumber = rowNumberText && /^\d+$/.test(rowNumberText) ? Number(rowNumberText) : lastRowNumber + 1
    lastRowNumber = rowNumber
    const body = rowMatch[2]
    for (const cellMatch of body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? ''
      const cellBody = cellMatch[2] ?? ''
      const reference = attribute(attrs, 'r') ?? ''
      const index = columnIndex(reference)
      if (index < 0 || index >= MAX_IMPORT_COLUMNS) continue
      const type = attribute(attrs, 't')
      const rawValue = cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ''
      let value = ''
      if (type === 's') value = sharedStrings[Number(rawValue)] ?? ''
      else if (type === 'inlineStr') value = Array.from(cellBody.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (item) => decodeXml(item[1])).join('')
      else if (type === 'b') value = rawValue === '1' ? 'TRUE' : 'FALSE'
      else value = decodeXml(rawValue)
      row[index] = value
    }
    const normalized = row.map((value) => value ?? '')
    if (isBlankRow(normalized)) {
      blankRun += 1
      // Real-world XLSX files often contain hundreds of thousands of styled-but-empty rows.
      // Once data has started, a long empty tail is treated as worksheet formatting rather than recipient data.
      if (rows.length > 1 && blankRun >= 1000) break
      continue
    }
    blankRun = 0
    rows.push(normalized)
    rowNumbers.push(rowNumber)
    if (rows.length >= MAX_IMPORT_ROWS + 2) break
  }
  return { rows, rowNumbers }
}

function resolveWorksheetTarget(workbookXml: string, relationshipsXml: string): { sheetName: string; path: string } {
  const sheetMatch = workbookXml.match(/<sheet\b([^>]*)\/?\s*>/)
  if (!sheetMatch) return { sheetName: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }
  const sheetName = attribute(sheetMatch[1], 'name') ?? 'Sheet1'
  const relationshipId = attribute(sheetMatch[1], 'r:id')
  if (!relationshipId) return { sheetName, path: 'xl/worksheets/sheet1.xml' }

  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    if (attribute(match[1], 'Id') !== relationshipId) continue
    const target = attribute(match[1], 'Target')
    if (!target) break
    const normalized = target.replace(/^\//, '').replace(/^xl\//, '')
    return { sheetName, path: `xl/${normalized}` }
  }
  return { sheetName, path: 'xl/worksheets/sheet1.xml' }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function parseXlsxArrayBuffer(buffer: ArrayBuffer, options: {
  fileName?: string
  fileSizeBytes?: number
  fileSha256?: string
} = {}): Promise<ParsedImportFile> {
  const entries = zipEntries(buffer)
  const workbookEntry = entries.get('xl/workbook.xml')
  const relationshipEntry = entries.get('xl/_rels/workbook.xml.rels')
  if (!workbookEntry || !relationshipEntry) throw new Error('Invalid XLSX workbook structure.')

  const workbookXml = textDecoder.decode(await readZipEntry(buffer, workbookEntry))
  const relationshipsXml = textDecoder.decode(await readZipEntry(buffer, relationshipEntry))
  const { sheetName, path } = resolveWorksheetTarget(workbookXml, relationshipsXml)
  const worksheetEntry = entries.get(path)
  if (!worksheetEntry) throw new Error(`The first XLSX worksheet (${sheetName}) could not be found.`)

  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const sharedStrings = sharedEntry ? parseSharedStrings(textDecoder.decode(await readZipEntry(buffer, sharedEntry))) : []
  const worksheetXml = textDecoder.decode(await readZipEntry(buffer, worksheetEntry))
  const parsedWorksheet = parseWorksheet(worksheetXml, sharedStrings)

  return matrixToParsedRows(parsedWorksheet.rows, {
    fileName: options.fileName ?? 'import.xlsx',
    fileType: 'xlsx',
    fileSizeBytes: options.fileSizeBytes ?? buffer.byteLength,
    fileSha256: options.fileSha256 ?? await sha256Hex(buffer),
    sheetName,
  }, parsedWorksheet.rowNumbers)
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedImportFile> {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('Import file is larger than the 5 MB phase limit.')
  const extension = file.name.split('.').pop()?.toLowerCase()
  const buffer = await file.arrayBuffer()
  const fileSha256 = await sha256Hex(buffer)

  if (extension === 'csv') {
    return parseCsvText(textDecoder.decode(buffer), { fileName: file.name, fileSizeBytes: file.size, fileSha256 })
  }
  if (extension === 'xlsx') {
    return parseXlsxArrayBuffer(buffer, { fileName: file.name, fileSizeBytes: file.size, fileSha256 })
  }
  if (extension === 'xls') throw new Error('Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.')
  throw new Error('Unsupported file type. Choose a .csv or .xlsx file.')
}
