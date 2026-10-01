import { describe, expect, it } from 'vitest'
import { formatPairingCode, normalizePairingCode, pairingQrMatrix } from '../lib/pairingQr'

describe('pairing QR utilities', () => {
  it('normalizes and formats human-entered pairing codes', () => {
    expect(normalizePairingCode('ab23-cd45 ef67')).toBe('AB23CD45EF67')
    expect(formatPairingCode('AB23CD45EF67')).toBe('AB23-CD45-EF67')
  })

  it('generates the expected Version 1-L mask-0 matrix for a known pairing code', () => {
    const matrix = pairingQrMatrix('AB23CD45EF67')
    expect(matrix).toHaveLength(21)
    expect(matrix.every((row) => row.length === 21)).toBe(true)

    const rows = matrix.map((row) => row.map((cell) => (cell ? '1' : '0')).join(''))
    expect(rows).toEqual([
      '111111100101101111111',
      '100000100111001000001',
      '101110101101101011101',
      '101110100101001011101',
      '101110100010101011101',
      '100000100000101000001',
      '111111101010101111111',
      '000000001101100000000',
      '111011111111011000100',
      '010110010010010111000',
      '010101101010100010110',
      '111011010010011001110',
      '101001101000100111010',
      '000000001001010101100',
      '111111101011001000001',
      '100000101011110111111',
      '101110101001001000111',
      '101110100000001101110',
      '101110101100100100001',
      '100000101110001000011',
      '111111101010101110101',
    ])
  })

  it('rejects values outside the fixed pairing-code envelope', () => {
    expect(() => pairingQrMatrix('ABC')).toThrow(/12-character/)
  })
})
