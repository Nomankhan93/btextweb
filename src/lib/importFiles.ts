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

export const MAX_IMPORT_COLUMNS = 100

// These are archive-safety guards, not product upload limits. They protect the browser
// from malformed/zip-bomb XLSX entries while allowing normal large recipient files.
const MAX_XLSX_EXPANDED_BYTES = 256 * 1024 * 1024
const MAX_XLSX_ENTRY_BYTES = 128 * 1024 * 1024

export interface SpreadsheetParseProgress {
  phase: 'reading' | 'hashing' | 'parsing'
  loadedBytes: number
  totalBytes: number
}

export interface SpreadsheetParseOptions {
  signal?: AbortSignal
  onProgress?: (progress: SpreadsheetParseProgress) => void
}

const textDecoder = new TextDecoder('utf-8')

function normalizeHeader(value: string, index: number, seen: Set<string>): string {
  const base = value.trim() || `Column ${index + 1}`
  let candidate = base
  let count = 1
  while (seen.has(candidate.toLowerCase())) candidate = `${base} (${++count})`
  seen.add(candidate.toLowerCase())
  return candidate
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

  if (candidateHeaderIndex < 0 && headerRow.row.some((value) => /^\+?(?:92|0)?3\d{9}$/.test(value.replace(/[\s()-]/g, '')))) {
    throw new Error('This file appears to have no column headers. Add a header row (for example Name, Mobile) above the first recipient and upload again.')
  }
  const seen = new Set<string>()
  const headerWidth = meaningful.slice(headerIndex).reduce((width, { row }) => Math.max(width, row.length), 0)
  if (headerWidth > MAX_IMPORT_COLUMNS) throw new Error(`The file has more than ${MAX_IMPORT_COLUMNS} columns. Remove unused columns before importing.`)
  const rawHeaders = Array.from({ length: headerWidth }, (_, index) => headerRow.row[index] ?? '')
  const headers = rawHeaders.map((value, index) => normalizeHeader(value, index, seen))
  if (headers.length === 0) throw new Error('The import file does not contain a header row.')

  const dataRows = meaningful.slice(headerIndex + 1)
  const rows: ParsedImportRow[] = dataRows.map(({ row, sourceRowNumber }) => {
    const values: Record<string, string> = Object.create(null)
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
    truncated: false,
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
  const sampleLines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).filter((line) => line.trim()).slice(0, 5)
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
  let closedQuote = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }

    if (closedQuote && char !== delimiter && char !== '\r' && char !== '\n') throw new Error('CSV has unexpected text after a quoted field. Export a fresh UTF-8 CSV.')
    if (char === '"' && field === '') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      closedQuote = false
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
      closedQuote = false
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
  uncompressedSize: number
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
    if (offset + 46 > eocd) throw new Error('Invalid XLSX directory bounds.')
    if (u32(view, offset) !== 0x02014b50) throw new Error('Invalid XLSX archive: central-directory entry is malformed.')
    if (u16(view, offset + 8) & 1) throw new Error('Password-protected XLSX files are not supported.')
    const uncompressedSize = u32(view, offset + 24)
    const compressionMethod = u16(view, offset + 10)
    const compressedSize = u32(view, offset + 20)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const localHeaderOffset = u32(view, offset + 42)
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, '/')
    if (offset + 46 + nameLength + extraLength + commentLength > eocd || entries.has(name)) throw new Error('Invalid XLSX directory entry.')
    entries.set(name, { name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  if ([...entries.values()].reduce((sum, entry) => sum + entry.uncompressedSize, 0) > MAX_XLSX_EXPANDED_BYTES) throw new Error('This XLSX expands to an unsafe amount of data in the browser. Export the recipient worksheet as CSV and try again.')
  return entries
}

interface HuffmanTable {
  maxBits: number
  symbolsByLength: Array<Map<number, number> | undefined>
}

class DeflateBitReader {
  private bitOffset = 0

  constructor(private readonly bytes: Uint8Array) {}

  readBits(count: number): number {
    if (count < 0 || count > 24) throw new Error('Invalid DEFLATE bit request.')
    if (this.bitOffset + count > this.bytes.length * 8) throw new Error('Compressed XLSX entry ended unexpectedly.')
    let value = 0
    for (let index = 0; index < count; index += 1) {
      const absolute = this.bitOffset + index
      value |= ((this.bytes[absolute >>> 3] >>> (absolute & 7)) & 1) << index
    }
    this.bitOffset += count
    return value
  }

  alignByte() {
    this.bitOffset = (this.bitOffset + 7) & ~7
  }
}

function buildHuffmanTable(lengths: number[]): HuffmanTable {
  const maxBits = lengths.reduce((max, value) => Math.max(max, value), 0)
  if (maxBits === 0) throw new Error('XLSX DEFLATE stream contains an empty Huffman table.')
  const counts = Array<number>(maxBits + 1).fill(0)
  for (const length of lengths) {
    if (length < 0 || length > 15) throw new Error('XLSX DEFLATE stream contains an invalid Huffman code length.')
    if (length > 0) counts[length] += 1
  }
  const nextCode = Array<number>(maxBits + 1).fill(0)
  let code = 0
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + counts[bits - 1]) << 1
    nextCode[bits] = code
  }
  const symbolsByLength: Array<Map<number, number> | undefined> = Array(maxBits + 1)
  lengths.forEach((length, symbol) => {
    if (length === 0) return
    const value = nextCode[length]++
    const bucket = symbolsByLength[length] ?? new Map<number, number>()
    bucket.set(value, symbol)
    symbolsByLength[length] = bucket
  })
  return { maxBits, symbolsByLength }
}

function decodeHuffmanSymbol(reader: DeflateBitReader, table: HuffmanTable): number {
  let code = 0
  for (let length = 1; length <= table.maxBits; length += 1) {
    code = (code << 1) | reader.readBits(1)
    const symbol = table.symbolsByLength[length]?.get(code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('XLSX DEFLATE stream contains an invalid Huffman symbol.')
}

const lengthBases = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const lengthExtraBits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const distanceBases = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const distanceExtraBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

function fixedHuffmanTables(): { literal: HuffmanTable; distance: HuffmanTable } {
  const literalLengths = Array<number>(288).fill(0)
  for (let symbol = 0; symbol <= 143; symbol += 1) literalLengths[symbol] = 8
  for (let symbol = 144; symbol <= 255; symbol += 1) literalLengths[symbol] = 9
  for (let symbol = 256; symbol <= 279; symbol += 1) literalLengths[symbol] = 7
  for (let symbol = 280; symbol <= 287; symbol += 1) literalLengths[symbol] = 8
  return {
    literal: buildHuffmanTable(literalLengths),
    distance: buildHuffmanTable(Array<number>(32).fill(5)),
  }
}

function dynamicHuffmanTables(reader: DeflateBitReader): { literal: HuffmanTable; distance: HuffmanTable } {
  const literalCount = reader.readBits(5) + 257
  const distanceCount = reader.readBits(5) + 1
  const codeLengthCount = reader.readBits(4) + 4
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
  const codeLengths = Array<number>(19).fill(0)
  for (let index = 0; index < codeLengthCount; index += 1) codeLengths[order[index]] = reader.readBits(3)
  const codeLengthTable = buildHuffmanTable(codeLengths)
  const lengths: number[] = []
  const target = literalCount + distanceCount
  while (lengths.length < target) {
    const symbol = decodeHuffmanSymbol(reader, codeLengthTable)
    if (symbol <= 15) {
      lengths.push(symbol)
      continue
    }
    if (symbol === 16) {
      if (lengths.length === 0) throw new Error('XLSX DEFLATE repeat code has no previous length.')
      const repeat = reader.readBits(2) + 3
      const previous = lengths[lengths.length - 1]
      for (let index = 0; index < repeat; index += 1) lengths.push(previous)
    } else if (symbol === 17) {
      const repeat = reader.readBits(3) + 3
      for (let index = 0; index < repeat; index += 1) lengths.push(0)
    } else if (symbol === 18) {
      const repeat = reader.readBits(7) + 11
      for (let index = 0; index < repeat; index += 1) lengths.push(0)
    } else {
      throw new Error('XLSX DEFLATE stream contains an invalid code-length symbol.')
    }
    if (lengths.length > target) throw new Error('XLSX DEFLATE code-length table overflowed.')
  }
  const literalLengths = lengths.slice(0, literalCount)
  const distanceLengths = lengths.slice(literalCount)
  if (!literalLengths[256]) throw new Error('XLSX DEFLATE stream is missing its end-of-block symbol.')
  return { literal: buildHuffmanTable(literalLengths), distance: buildHuffmanTable(distanceLengths) }
}

export function inflateRawFallback(compressed: Uint8Array, expectedSize: number): Uint8Array {
  if (!Number.isInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_XLSX_ENTRY_BYTES) throw new Error('XLSX expanded entry size is unsafe.')
  const reader = new DeflateBitReader(compressed)
  const output = new Uint8Array(expectedSize)
  let outputOffset = 0
  let finalBlock = false

  const appendByte = (value: number) => {
    if (outputOffset >= output.length) throw new Error('XLSX DEFLATE stream expanded beyond its declared size.')
    output[outputOffset++] = value & 0xff
  }

  while (!finalBlock) {
    finalBlock = reader.readBits(1) === 1
    const blockType = reader.readBits(2)
    if (blockType === 0) {
      reader.alignByte()
      const length = reader.readBits(16)
      const inverse = reader.readBits(16)
      if (((length ^ 0xffff) & 0xffff) !== inverse) throw new Error('XLSX DEFLATE stored block length check failed.')
      for (let index = 0; index < length; index += 1) appendByte(reader.readBits(8))
      continue
    }
    if (blockType === 3) throw new Error('XLSX DEFLATE stream uses a reserved block type.')
    const tables = blockType === 1 ? fixedHuffmanTables() : dynamicHuffmanTables(reader)
    while (true) {
      const symbol = decodeHuffmanSymbol(reader, tables.literal)
      if (symbol < 256) {
        appendByte(symbol)
        continue
      }
      if (symbol === 256) break
      const lengthIndex = symbol - 257
      if (lengthIndex < 0 || lengthIndex >= lengthBases.length) throw new Error('XLSX DEFLATE stream contains an invalid length symbol.')
      const copyLength = lengthBases[lengthIndex] + reader.readBits(lengthExtraBits[lengthIndex])
      const distanceSymbol = decodeHuffmanSymbol(reader, tables.distance)
      if (distanceSymbol < 0 || distanceSymbol >= distanceBases.length) throw new Error('XLSX DEFLATE stream contains an invalid distance symbol.')
      const distance = distanceBases[distanceSymbol] + reader.readBits(distanceExtraBits[distanceSymbol])
      if (distance < 1 || distance > outputOffset) throw new Error('XLSX DEFLATE stream references data before the start of the entry.')
      for (let index = 0; index < copyLength; index += 1) appendByte(output[outputOffset - distance])
    }
  }
  if (outputOffset !== expectedSize) throw new Error('Invalid XLSX expanded entry size.')
  return output
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function nativeInflateRaw(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Native DEFLATE decompression is unavailable.')
  const stream = new Blob([copyToArrayBuffer(compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const output = new Uint8Array(expectedSize)
  let position = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (position + value.length > expectedSize) throw new Error('Expanded XLSX entry is larger than declared.')
      output.set(value, position)
      position += value.length
    }
  } finally {
    reader.releaseLock()
  }
  if (position !== expectedSize) throw new Error('Invalid XLSX expanded entry size.')
  return output
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const offset = entry.localHeaderOffset
  if (offset + 30 > bytes.length) throw new Error('Invalid XLSX local header bounds.')
  if (u32(view, offset) !== 0x04034b50) throw new Error(`Invalid XLSX archive: local header for ${entry.name} is malformed.`)
  const nameLength = u16(view, offset + 26)
  const extraLength = u16(view, offset + 28)
  const start = offset + 30 + nameLength + extraLength
  if (start + entry.compressedSize > bytes.length || entry.uncompressedSize > MAX_XLSX_ENTRY_BYTES) throw new Error('XLSX worksheet is malformed or expands to an unsafe size. Export it as CSV.')
  const compressed = bytes.slice(start, start + entry.compressedSize)

  if (entry.compressionMethod === 0) {
    if (compressed.length !== entry.uncompressedSize) throw new Error('Invalid XLSX entry size.')
    return compressed
  }
  if (entry.compressionMethod !== 8) throw new Error(`Unsupported XLSX compression method ${entry.compressionMethod}.`)

  try {
    return await nativeInflateRaw(compressed, entry.uncompressedSize)
  } catch {
    // Some browsers/webviews do not expose deflate-raw even when they support the
    // rest of the PWA stack. The pure-JS fallback keeps normal Excel files usable.
    return inflateRawFallback(compressed, entry.uncompressedSize)
  }
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
      if (index < 0) throw new Error('XLSX cell is missing its column reference. Export the sheet as CSV.')
      const type = attribute(attrs, 't')
      const rawValue = cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? ''
      let value = ''
      if (type === 's') value = sharedStrings[Number(rawValue)] ?? ''
      else if (type === 'inlineStr') value = Array.from(cellBody.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (item) => decodeXml(item[1])).join('')
      else if (type === 'b') value = rawValue === '1' ? 'TRUE' : 'FALSE'
      else value = decodeXml(rawValue)
      if (index >= MAX_IMPORT_COLUMNS) {
        if (value.trim()) throw new Error(`The worksheet has data beyond ${MAX_IMPORT_COLUMNS} columns. Remove unused columns before importing.`)
        continue
      }
      row[index] = value
    }
    const normalized = row.map((value) => value ?? '')
    if (isBlankRow(normalized)) continue
    rows.push(normalized)
    rowNumbers.push(rowNumber)
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

export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  try { return new TextDecoder(encoding, { fatal: true }).decode(buffer) }
  catch { throw new Error('CSV encoding could not be read. Save the file as UTF-8 CSV and upload again.') }
}

function importAbortError(): Error {
  const error = new Error('Import cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw importAbortError()
}

async function readFileBuffer(file: File, options: SpreadsheetParseOptions): Promise<ArrayBuffer> {
  throwIfAborted(options.signal)
  options.onProgress?.({ phase: 'reading', loadedBytes: 0, totalBytes: file.size })
  if (typeof file.stream !== 'function') {
    const buffer = await file.arrayBuffer()
    throwIfAborted(options.signal)
    options.onProgress?.({ phase: 'reading', loadedBytes: file.size, totalBytes: file.size })
    return buffer
  }

  const reader = file.stream().getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      throwIfAborted(options.signal)
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      options.onProgress?.({ phase: 'reading', loadedBytes: total, totalBytes: file.size })
    }
  } finally {
    if (options.signal?.aborted) await reader.cancel().catch(() => undefined)
    else reader.releaseLock()
  }
  throwIfAborted(options.signal)
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined.buffer
}

export async function parseSpreadsheetFile(file: File, options: SpreadsheetParseOptions = {}): Promise<ParsedImportFile> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'xls') throw new Error('Legacy .xls files are not supported. Save the workbook as .xlsx or CSV.')
  if (extension !== 'csv' && extension !== 'xlsx') throw new Error('Unsupported file type. Choose a .csv or .xlsx file.')
  if (file.size < 1) throw new Error('The selected file is empty.')

  const buffer = await readFileBuffer(file, options)
  throwIfAborted(options.signal)
  options.onProgress?.({ phase: 'hashing', loadedBytes: file.size, totalBytes: file.size })
  const fileSha256 = await sha256Hex(buffer)
  throwIfAborted(options.signal)
  options.onProgress?.({ phase: 'parsing', loadedBytes: file.size, totalBytes: file.size })

  if (extension === 'csv') {
    return parseCsvText(decodeCsvBuffer(buffer), { fileName: file.name, fileSizeBytes: file.size, fileSha256 })
  }
  return parseXlsxArrayBuffer(buffer, { fileName: file.name, fileSizeBytes: file.size, fileSha256 })
}
