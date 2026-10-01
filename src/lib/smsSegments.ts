import { renderPersonalizedMessage, type PersonalizationSourceRow } from './messageComposer'

export type SmsEncoding = 'GSM-7' | 'Unicode'

export const SMS_SEGMENT_MODEL_VERSION = 'gsm7-ucs2-v1'
export const GSM7_SINGLE_SEGMENT_UNITS = 160
export const GSM7_MULTIPART_SEGMENT_UNITS = 153
export const UNICODE_SINGLE_SEGMENT_UNITS = 70
export const UNICODE_MULTIPART_SEGMENT_UNITS = 67
export const SMS_LONG_MESSAGE_WARNING_SEGMENTS = 4

// GSM 03.38 default alphabet. Characters in the extension table consume two septets.
const gsm7BasicCharacters = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
))

const gsm7ExtensionCharacters = new Set(Array.from('^{}\\[~]|€\f'))

export interface SmsMessageEstimate {
  encoding: SmsEncoding
  characters: number
  encodingUnits: number
  segments: number
  multipart: boolean
  singleSegmentLimit: number
  multipartSegmentLimit: number
  remainingUnitsInCurrentSegment: number
}

export interface PersonalizedSmsEstimate {
  row: PersonalizationSourceRow
  text: string
  complete: boolean
  missingTokens: string[]
  unsupportedTokens: string[]
  estimate: SmsMessageEstimate | null
}

export interface CampaignSmsUsageEstimate {
  recipientCount: number
  readyRecipients: number
  blockedRecipients: number
  estimatedSmsUnits: number
  averageSegments: number
  minimumSegments: number
  maximumSegments: number
  gsm7Recipients: number
  unicodeRecipients: number
  encodingSummary: SmsEncoding | 'Mixed' | '—'
  longMessageRecipients: number
  recipients: PersonalizedSmsEstimate[]
}

export function isGsm7Text(text: string): boolean {
  for (const character of text) {
    if (!gsm7BasicCharacters.has(character) && !gsm7ExtensionCharacters.has(character)) return false
  }
  return true
}

export function gsm7SeptetLength(text: string): number | null {
  let units = 0
  for (const character of text) {
    if (gsm7BasicCharacters.has(character)) units += 1
    else if (gsm7ExtensionCharacters.has(character)) units += 2
    else return null
  }
  return units
}

function segmentCount(units: number, singleLimit: number, multipartLimit: number): number {
  if (units <= 0) return 0
  if (units <= singleLimit) return 1
  return Math.ceil(units / multipartLimit)
}

function remainingInCurrentSegment(units: number, segments: number, singleLimit: number, multipartLimit: number): number {
  if (segments === 0) return singleLimit
  const limit = segments === 1 ? singleLimit : multipartLimit
  const consumedInLastSegment = segments === 1 ? units : units - multipartLimit * (segments - 1)
  return Math.max(0, limit - consumedInLastSegment)
}

export function estimateSmsMessage(text: string): SmsMessageEstimate {
  const gsmUnits = gsm7SeptetLength(text)
  if (gsmUnits != null) {
    const segments = segmentCount(gsmUnits, GSM7_SINGLE_SEGMENT_UNITS, GSM7_MULTIPART_SEGMENT_UNITS)
    return {
      encoding: 'GSM-7',
      characters: Array.from(text).length,
      encodingUnits: gsmUnits,
      segments,
      multipart: segments > 1,
      singleSegmentLimit: GSM7_SINGLE_SEGMENT_UNITS,
      multipartSegmentLimit: GSM7_MULTIPART_SEGMENT_UNITS,
      remainingUnitsInCurrentSegment: remainingInCurrentSegment(gsmUnits, segments, GSM7_SINGLE_SEGMENT_UNITS, GSM7_MULTIPART_SEGMENT_UNITS),
    }
  }

  // JavaScript string length counts UTF-16 code units. That is the conservative unit
  // model used here for UCS-2/Unicode SMS estimation; supplementary characters such
  // as emoji therefore consume two units.
  const unicodeUnits = text.length
  const segments = segmentCount(unicodeUnits, UNICODE_SINGLE_SEGMENT_UNITS, UNICODE_MULTIPART_SEGMENT_UNITS)
  return {
    encoding: 'Unicode',
    characters: Array.from(text).length,
    encodingUnits: unicodeUnits,
    segments,
    multipart: segments > 1,
    singleSegmentLimit: UNICODE_SINGLE_SEGMENT_UNITS,
    multipartSegmentLimit: UNICODE_MULTIPART_SEGMENT_UNITS,
    remainingUnitsInCurrentSegment: remainingInCurrentSegment(unicodeUnits, segments, UNICODE_SINGLE_SEGMENT_UNITS, UNICODE_MULTIPART_SEGMENT_UNITS),
  }
}

export function estimatePersonalizedSmsUsage(template: string, rows: PersonalizationSourceRow[]): CampaignSmsUsageEstimate {
  const recipients = rows.map<PersonalizedSmsEstimate>((row) => {
    const rendered = renderPersonalizedMessage(template, row)
    return {
      row,
      text: rendered.text,
      complete: rendered.complete,
      missingTokens: rendered.missingTokens,
      unsupportedTokens: rendered.unsupportedTokens,
      estimate: rendered.complete ? estimateSmsMessage(rendered.text) : null,
    }
  })

  const ready = recipients.filter((recipient) => recipient.estimate != null)
  const segmentValues = ready.map((recipient) => recipient.estimate?.segments ?? 0)
  const estimatedSmsUnits = segmentValues.reduce((sum, value) => sum + value, 0)
  const gsm7Recipients = ready.filter((recipient) => recipient.estimate?.encoding === 'GSM-7').length
  const unicodeRecipients = ready.filter((recipient) => recipient.estimate?.encoding === 'Unicode').length
  const encodingSummary: CampaignSmsUsageEstimate['encodingSummary'] = ready.length === 0
    ? '—'
    : gsm7Recipients === ready.length
      ? 'GSM-7'
      : unicodeRecipients === ready.length
        ? 'Unicode'
        : 'Mixed'

  return {
    recipientCount: recipients.length,
    readyRecipients: ready.length,
    blockedRecipients: recipients.length - ready.length,
    estimatedSmsUnits,
    averageSegments: ready.length ? estimatedSmsUnits / ready.length : 0,
    minimumSegments: segmentValues.length ? Math.min(...segmentValues) : 0,
    maximumSegments: segmentValues.length ? Math.max(...segmentValues) : 0,
    gsm7Recipients,
    unicodeRecipients,
    encodingSummary,
    longMessageRecipients: ready.filter((recipient) => (recipient.estimate?.segments ?? 0) >= SMS_LONG_MESSAGE_WARNING_SEGMENTS).length,
    recipients,
  }
}
