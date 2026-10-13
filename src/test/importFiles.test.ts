import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeCsvBuffer, detectCsvDelimiter, inflateRawFallback, parseCsvText, parseDelimitedText, parseXlsxArrayBuffer } from '../lib/importFiles'

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function le16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

function le32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ])
}

function storedZip(entries: Array<[string, string]>): ArrayBuffer {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let localOffset = 0

  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(content)
    const local = concat([
      le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(0), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0),
      nameBytes, data,
    ])
    localChunks.push(local)

    const central = concat([
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(0), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0), le16(0),
      le16(0), le16(0), le32(0), le32(localOffset), nameBytes,
    ])
    centralChunks.push(central)
    localOffset += local.length
  }

  const localBytes = concat(localChunks)
  const centralBytes = concat(centralChunks)
  const end = concat([
    le32(0x06054b50), le16(0), le16(0), le16(entries.length), le16(entries.length),
    le32(centralBytes.length), le32(localBytes.length), le16(0),
  ])
  const zip = concat([localBytes, centralBytes, end])
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
}

describe('CSV import parsing', () => {
  it('detects common delimiters', () => {
    expect(detectCsvDelimiter('Name,Mobile\nA,0300')).toBe(',')
    expect(detectCsvDelimiter('Name;Mobile\nA;0300')).toBe(';')
    expect(detectCsvDelimiter('Name\tMobile\nA\t0300')).toBe('\t')
  })

  it('handles quoted commas, escaped quotes and embedded newlines', () => {
    const rows = parseDelimitedText('Name,Note\n"Ali, Khan","Said ""hello""\nand left"\n', ',')
    expect(rows).toEqual([
      ['Name', 'Note'],
      ['Ali, Khan', 'Said "hello"\nand left'],
    ])
  })

  it('normalizes duplicate/blank headers without dropping data', () => {
    const parsed = parseCsvText('Mobile,Mobile,\n03001234567,+923111234567,VIP\n', { fileSha256: 'a'.repeat(64) })
    expect(parsed.headers).toEqual(['Mobile', 'Mobile (2)', 'Column 3'])
    expect(parsed.rows[0].values['Mobile (2)']).toBe('+923111234567')
    expect(parsed.rows[0].values['Column 3']).toBe('VIP')
  })
})


it('parses more than 5,000 CSV recipients without truncation', () => {
  const rows = Array.from({ length: 12000 }, (_, index) => `Recipient ${index + 1},03${String(100000000 + index).slice(-9)}`)
  const parsed = parseCsvText(`Name,Mobile\n${rows.join('\n')}`, { fileSha256: 'd'.repeat(64) })
  expect(parsed.rows).toHaveLength(12000)
  expect(parsed.sourceRowCount).toBe(12000)
  expect(parsed.truncated).toBe(false)
})

it('inflates raw DEFLATE data with the browser-independent XLSX fallback', () => {
  const source = new TextEncoder().encode('BulkText XLSX fallback '.repeat(250))
  const compressed = new Uint8Array(deflateRawSync(source))
  expect(inflateRawFallback(compressed, source.length)).toEqual(source)
})

describe('XLSX import parsing', () => {
  it('reads the first worksheet without a third-party parser', async () => {
    const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Recipients" sheetId="1" r:id="rId1"/></sheets></workbook>'
    const rels = '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
    const shared = '<?xml version="1.0"?><sst><si><t>Name</t></si><si><t>Mobile</t></si><si><t>City</t></si><si><t>Ali</t></si><si><t>Karachi</t></si><si><t>Sara</t></si><si><t>Hyderabad</t></si></sst>'
    const sheet = '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="str"><v>03001234567</v></c><c r="C2" t="s"><v>4</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="str"><v>+923111234567</v></c><c r="C3" t="s"><v>6</v></c></row>' +
      '</sheetData></worksheet>'

    const buffer = storedZip([
      ['xl/workbook.xml', workbook],
      ['xl/_rels/workbook.xml.rels', rels],
      ['xl/sharedStrings.xml', shared],
      ['xl/worksheets/sheet1.xml', sheet],
    ])

    const parsed = await parseXlsxArrayBuffer(buffer, { fileName: 'recipients.xlsx', fileSha256: 'b'.repeat(64) })
    expect(parsed.fileType).toBe('xlsx')
    expect(parsed.sheetName).toBe('Recipients')
    expect(parsed.headers).toEqual(['Name', 'Mobile', 'City'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].values).toEqual({ Name: 'Ali', Mobile: '03001234567', City: 'Karachi' })
    expect(parsed.rows[1].values.Mobile).toBe('+923111234567')
  })

  it('finds a phone header after title rows and ignores styled empty tail rows', async () => {
    const workbook = '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
    const rels = '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
    const shared = '<?xml version="1.0"?><sst><si><t>Customer Export</t></si><si><t>name</t></si><si><t>Contact</t></si><si><t>Nimra</t></si></sst>'
    const emptyRows = Array.from({ length: 1002 }, (_, index) => `<row r="${index + 5}"><c r="A${index + 5}" s="1"/></row>`).join('')
    const sheet = '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c></row>' +
      '<row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4" t="str"><v>923041013222</v></c></row>' +
      emptyRows + '</sheetData></worksheet>'
    const buffer = storedZip([
      ['xl/workbook.xml', workbook],
      ['xl/_rels/workbook.xml.rels', rels],
      ['xl/sharedStrings.xml', shared],
      ['xl/worksheets/sheet1.xml', sheet],
    ])
    const parsed = await parseXlsxArrayBuffer(buffer, { fileName: 'messy.xlsx', fileSha256: 'c'.repeat(64) })
    expect(parsed.headers).toEqual(['name', 'Contact'])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].sourceRowNumber).toBe(4)
    expect(parsed.rows[0].values.Contact).toBe('923041013222')
  })

})

describe('0.18.6 import regressions', () => {
  it('preserves colliding explicit/generated headers and prototype-named columns', () => {
    const parsed = parseCsvText('Mobile,Mobile,Mobile (2),__proto__\n03001234567,03111234567,03221234567,VIP')
    expect(new Set(parsed.headers.map((h) => h.toLowerCase())).size).toBe(4)
    expect(Object.values(parsed.rows[0].values)).toEqual(['03001234567', '03111234567', '03221234567', 'VIP'])
  })
  it('preserves data columns wider than the header and supports CR-only exports', () => {
    const parsed = parseCsvText('Mobile\r03001234567,Ali\r03111234567,Sara')
    expect(parsed.headers).toEqual(['Mobile', 'Column 2'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[1].values['Column 2']).toBe('Sara')
  })
  it('rejects headerless contacts and excessive columns instead of silently losing data', () => {
    expect(() => parseCsvText('03001234567,Ali\n03111234567,Sara')).toThrow(/headers/)
    expect(() => parseCsvText('Mobile,' + Array(100).fill('Extra').join(',') + '\n03001234567')).toThrow(/100 columns/)
  })
  function workbook(sheet: string) {
    return storedZip([
      ['xl/workbook.xml', '<workbook><sheets><sheet name="Data" r:id="id"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="id" Target="worksheets/sheet1.xml"/></Relationships>'],
      ['xl/worksheets/sheet1.xml', `<worksheet><sheetData>${sheet}</sheetData></worksheet>`],
    ])
  }
  function row(n: number, value: string) { return `<row r="${n}"><c r="A${n}" t="inlineStr"><is><t>${value}</t></is></c></row>` }
  it('reads recipients beyond long styled blank gaps', async () => {
    const blanks = Array.from({ length: 1001 }, (_, i) => row(i + 3, '')).join('')
    const parsed = await parseXlsxArrayBuffer(workbook(row(1, 'Mobile') + row(2, '03001234567') + blanks + row(1004, '03111234567')), { fileSha256: 'x' })
    expect(parsed.rows.map((r) => r.sourceRowNumber)).toEqual([2, 1004])
  })
  it('keeps all rows beyond the former 5,000-row ceiling', async () => {
    const preamble = Array.from({ length: 19 }, (_, i) => row(i + 1, 'Export title')).join('')
    const data = Array.from({ length: 5001 }, (_, i) => row(i + 21, '03001234567')).join('')
    const parsed = await parseXlsxArrayBuffer(workbook(preamble + row(20, 'Mobile') + data), { fileSha256: 'x' })
    expect(parsed.truncated).toBe(false)
    expect(parsed.sourceRowCount).toBe(5001)
    expect(parsed.rows).toHaveLength(5001)
  })
  it('rejects out-of-bounds XLSX directories and oversized expanded entries', async () => {
    const buffer = workbook(row(1, 'Mobile'))
    const view = new DataView(buffer)
    view.setUint32(buffer.byteLength - 6, 0xfffffff0, true)
    await expect(parseXlsxArrayBuffer(buffer)).rejects.toThrow(/bounds/)
    const large = workbook(row(1, 'Mobile'))
    const bytes = new DataView(large)
    const central = bytes.getUint32(large.byteLength - 6, true)
    bytes.setUint32(central + 24, 300 * 1024 * 1024, true)
    await expect(parseXlsxArrayBuffer(large)).rejects.toThrow(/unsafe/)
  })
})

it('decodes BOM-marked UTF-16 CSV and rejects invalid UTF-8 rather than replacing characters', () => {
  const text = 'Mobile\r\n03001234567'
  const bytes = new Uint8Array(2 + text.length * 2); bytes.set([255, 254])
  for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i)
  expect(decodeCsvBuffer(bytes.buffer)).toBe(text)
  expect(() => decodeCsvBuffer(new Uint8Array([0xff, 0xff]).buffer)).toThrow(/UTF-8/)
  expect(() => parseCsvText('Mobile\n"03001234567"junk')).toThrow(/quoted field/)
})
