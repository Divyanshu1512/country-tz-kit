import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import { isSupportedCallingCode, normalizeCallingCode } from './country-metadata.js'

const UNSAFE_PHONE_TEXT = /[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}<>]/u

/**
 * Normalizes a user-supplied phone string with an optional default calling code
 * into an E.164 string (e.g. `'+919876501234'`). Supports national trunk
 * prefixes (`020 7946 0018` + `'+44'`) and `'00'` international access prefixes.
 *
 * Formatting is not validation or ownership verification. Use
 * `validateInternationalPhone` for strict calling-code matching and validity.
 */
export function normalizeInternationalPhone(phone: unknown, callingCode?: unknown): string {
  if (typeof phone !== 'string' || phone.length > 40 || UNSAFE_PHONE_TEXT.test(phone)) return ''
  const raw = phone.trim().replace(/\p{Zs}/gu, ' ')
  if (!/^[+0-9 ().-]+$/.test(raw)) return ''
  const compact = raw.replace(/[ ().-]/g, '')
  if (!/^\+?[0-9]+$/.test(compact)) return ''
  const candidate = compact.startsWith('00') ? `+${compact.slice(2)}` : raw
  const code = callingCode === undefined ? null : normalizeCallingCode(callingCode)
  if (callingCode !== undefined && callingCode !== null && callingCode !== '' && !code) return ''
  return (
    parsePhoneNumberFromString(candidate, {
      defaultCallingCode: code ? code.slice(1) : undefined,
      extract: false,
    })?.number || ''
  )
}

/**
 * Strictly validates a phone number against an explicitly selected country
 * calling code (`+1`, `+44`, `+91`, etc.):
 * - Rejects malformed calling codes (bare digits without `'+'`, unknown codes).
 * - Rejects mismatched calling codes (e.g. `+44...` submitted under `+91`).
 * - Verifies `libphonenumber-js/max` `isValid()` national numbering rules.
 * - Rejects obviously synthetic uniform-digit national numbers (`9999999999`).
 *
 * Returns canonical E.164 string when valid, or `null` otherwise.
 */
export function validateInternationalPhone(raw: unknown, callingCode: unknown): string | null {
  if (
    typeof callingCode !== 'string' ||
    callingCode.length > 16 ||
    UNSAFE_PHONE_TEXT.test(callingCode)
  ) {
    return null
  }
  const code = callingCode.trim()
  if (!isSupportedCallingCode(code)) return null
  const international = normalizeInternationalPhone(raw, code)
  if (!/^\+[1-9][0-9]{6,14}$/.test(international)) return null
  const number = parsePhoneNumberFromString(international, { extract: false })
  if (
    !number?.isValid() ||
    `+${number.countryCallingCode}` !== code ||
    /^([0-9])\1{5,}$/.test(number.nationalNumber)
  ) {
    return null
  }
  return number.number
}
