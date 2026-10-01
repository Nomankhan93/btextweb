const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

function appendBits(target: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) target.push((value >>> i) & 1)
}

function gfMultiply(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function reedSolomonDivisor(degree: number) {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function reedSolomonRemainder(data: number[], divisor: number[]) {
  const result = Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < result.length; i += 1) result[i] ^= gfMultiply(divisor[i], factor)
  }
  return result
}

export function normalizePairingCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatPairingCode(value: string) {
  const normalized = normalizePairingCode(value)
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized
}

function makeCodewords(pairingCode: string) {
  const normalized = normalizePairingCode(pairingCode)
  if (normalized.length !== 12) throw new Error('Pairing QR requires a 12-character code.')
  for (const char of normalized) {
    if (!ALPHANUMERIC.includes(char)) throw new Error(`Pairing QR cannot encode ${char}.`)
  }

  const bits: number[] = []
  appendBits(bits, 0b0010, 4) // QR alphanumeric mode
  appendBits(bits, normalized.length, 9) // Version 1 character count

  for (let i = 0; i + 1 < normalized.length; i += 2) {
    appendBits(bits, ALPHANUMERIC.indexOf(normalized[i]) * 45 + ALPHANUMERIC.indexOf(normalized[i + 1]), 11)
  }
  if (normalized.length % 2 === 1) appendBits(bits, ALPHANUMERIC.indexOf(normalized.at(-1)!), 6)

  const capacityBits = 19 * 8 // Version 1-L has 19 data codewords
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j]
    data.push(value)
  }

  for (let pad = 0; data.length < 19; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11)
  const ecc = reedSolomonRemainder(data, reedSolomonDivisor(7))
  return [...data, ...ecc]
}

function bit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0
}

/**
 * Generates a standards-compliant QR Version 1-L matrix using mask pattern 0.
 * BulkText pairing codes are exactly 12 QR-alphanumeric characters, so the
 * intentionally narrow encoder keeps the browser bundle dependency-free.
 */
export function pairingQrMatrix(pairingCode: string): boolean[][] {
  const size = 21
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const isFunction = Array.from({ length: size }, () => Array<boolean>(size).fill(false))

  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  const drawFinder = (centerX: number, centerY: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4)
      }
    }
  }

  // Timing patterns are drawn first; finder patterns then overwrite their ends.
  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0)
    setFunction(i, 6, i % 2 === 0)
  }
  drawFinder(3, 3)
  drawFinder(size - 4, 3)
  drawFinder(3, size - 4)

  // Format information for ECC level L (format value 1) and mask pattern 0.
  const data = (1 << 3) | 0
  let rem = data
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const formatBits = ((data << 10) | rem) ^ 0x5412

  for (let i = 0; i <= 5; i += 1) setFunction(8, i, bit(formatBits, i))
  setFunction(8, 7, bit(formatBits, 6))
  setFunction(8, 8, bit(formatBits, 7))
  setFunction(7, 8, bit(formatBits, 8))
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, bit(formatBits, i))

  for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, bit(formatBits, i))
  for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, bit(formatBits, i))
  setFunction(8, size - 8, true) // Always-dark module

  const codewords = makeCodewords(pairingCode)
  let dataBitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0
      const y = upward ? size - 1 - vertical : vertical
      for (let j = 0; j < 2; j += 1) {
        const x = right - j
        if (isFunction[y][x]) continue
        let dark = false
        if (dataBitIndex < codewords.length * 8) {
          dark = bit(codewords[dataBitIndex >>> 3], 7 - (dataBitIndex & 7))
          dataBitIndex += 1
        }
        if ((x + y) % 2 === 0) dark = !dark // Mask pattern 0
        modules[y][x] = dark
      }
    }
  }

  if (dataBitIndex !== codewords.length * 8) throw new Error('Pairing QR data placement failed.')
  return modules
}
