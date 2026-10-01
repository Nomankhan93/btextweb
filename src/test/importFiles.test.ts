import { describe, expect, it } from 'vitest'
import { detectCsvDelimiter, parseCsvText, parseDelimitedText, parseXlsxArrayBuffer } from '../lib/importFiles'

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
})
