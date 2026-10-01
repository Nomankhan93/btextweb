export type PhoneValidationStatus =
  | 'valid'
  | 'empty'
  | 'invalid_characters'
  | 'invalid_length'
  | 'unsupported_country'
  | 'unsupported_number_type'

export interface PhoneNumberNormalization {
  rawInput: string
  normalizedE164: string | null
  countryIso: 'PK' | null
  countryCallingCode: '92' | null
  nationalNumber: string | null
  numberType: 'mobile' | null
  validationStatus: PhoneValidationStatus
  validationReason: string
  normalizationVersion: 'pk-mobile-v1'
}

const allowedCharacters = /^[0-9+() .-]+$/

export function normalizePakistanMobile(raw: string): PhoneNumberNormalization {
  const rawInput = raw
  const input = raw.trim()
  const base: PhoneNumberNormalization = {
    rawInput,
    normalizedE164: null,
    countryIso: null,
    countryCallingCode: null,
    nationalNumber: null,
    numberType: null,
    validationStatus: 'empty',
    validationReason: 'Phone number is empty.',
    normalizationVersion: 'pk-mobile-v1',
  }

  if (!input) return base

  if (!allowedCharacters.test(input)) {
    return {
      ...base,
      validationStatus: 'invalid_characters',
      validationReason: 'Only digits, spaces, +, parentheses, dots and hyphens are supported.',
    }
  }

  let compact = input.replace(/[() .-]/g, '')
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`

  if (compact.includes('+') && !/^\+[0-9]+$/.test(compact)) {
    return {
      ...base,
      validationStatus: 'invalid_characters',
      validationReason: 'The + sign is only valid at the beginning of an international number.',
    }
  }

  let national: string
  if (compact.startsWith('+')) {
    if (!compact.startsWith('+92')) {
      return {
        ...base,
        validationStatus: 'unsupported_country',
        validationReason: 'BulkText 0.8 currently supports Pakistan mobile numbers only.',
      }
    }
    national = compact.slice(3)
  } else if (compact.startsWith('92')) {
    national = compact.slice(2)
  } else if (compact.startsWith('0')) {
    national = compact.slice(1)
  } else {
    national = compact
  }

  if (!/^\d+$/.test(national)) {
    return {
      ...base,
      validationStatus: 'invalid_characters',
      validationReason: 'The number contains unsupported characters.',
    }
  }

  if (national.length !== 10) {
    return {
      ...base,
      countryIso: 'PK',
      countryCallingCode: '92',
      nationalNumber: national || null,
      validationStatus: 'invalid_length',
      validationReason: 'Pakistan mobile numbers must contain 10 national digits after the country code.',
    }
  }

  if (!/^3\d{9}$/.test(national)) {
    return {
      ...base,
      countryIso: 'PK',
      countryCallingCode: '92',
      nationalNumber: national,
      validationStatus: 'unsupported_number_type',
      validationReason: 'Only Pakistan mobile numbers (03xx / +923xx) are supported in this phase.',
    }
  }

  return {
    ...base,
    normalizedE164: `+92${national}`,
    countryIso: 'PK',
    countryCallingCode: '92',
    nationalNumber: national,
    numberType: 'mobile',
    validationStatus: 'valid',
    validationReason: 'Valid Pakistan mobile number.',
  }
}

export function isCanonicalPakistanMobileE164(value: string): boolean {
  return /^\+923\d{9}$/.test(value)
}

export function normalizePhoneNumberLines(value: string): PhoneNumberNormalization[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePakistanMobile)
}
