import { isKnownIanaTimeZone, resolveCountryCode } from './country-metadata.js'
import { isValidIanaTimeZone, timezoneBelongsToCountry } from './user-datetime.js'

export const VALIDATION_LIMITS = Object.freeze({
  fullName: Object.freeze([1, 160] as const),
  city: Object.freeze([2, 160] as const),
  addressLine1: Object.freeze([6, 240] as const),
  addressLine2: Object.freeze([0, 240] as const),
  stateRegion: Object.freeze([0, 160] as const),
  postalCode: Object.freeze([0, 32] as const),
  timezone: Object.freeze([3, 80] as const),
  locale: Object.freeze([2, 35] as const),
})

export const VALIDATION_ERROR_CODES = Object.freeze({
  INVALID_TEXT: 'INVALID_TEXT',
  INVALID_FULL_NAME: 'INVALID_FULL_NAME',
  INVALID_COUNTRY: 'INVALID_COUNTRY',
  INVALID_CITY: 'INVALID_CITY',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_OPTIONAL_TEXT: 'INVALID_OPTIONAL_TEXT',
  INVALID_DISPLAY_PREFERENCE: 'INVALID_DISPLAY_PREFERENCE',
})

export interface SafeTextOptions {
  min?: number
  max?: number
  optional?: boolean
}

export interface SafeTextResult {
  readonly valid: boolean
  readonly text: string
}

export interface DisplayPreferencesInput {
  timezone?: string | null
  timeZone?: string | null
  locale?: string | null
  hour_format?: string | null
  hourFormat?: string | null
  country?: string | null
  country_code?: string | null
  countryCode?: string | null
}

export interface DisplayPreferencesValidationResult {
  readonly valid: boolean
  readonly errors: Readonly<Record<string, string>>
  readonly normalized: Readonly<{
    timezone?: string | null
    locale?: string | null
    hourFormat?: '12h' | '24h' | null
    countryCode?: string
  }>
}

export interface ContactFieldsInput {
  fullName?: string
  country?: string
  countryCode?: string
  city?: string
  addressLine1?: string
  addressLine2?: string | null
  stateRegion?: string | null
  postalCode?: string | null
  timezone?: string | null
  locale?: string | null
  hourFormat?: string | null
}

export interface ContactFieldsValidationResult {
  readonly valid: boolean
  readonly errors: Readonly<Record<string, string>>
  readonly normalized: Readonly<{
    fullName: string
    countryCode: string | null
    city: string
    addressLine1: string
    addressLine2: string
    stateRegion: string
    postalCode: string
    timezone?: string | null
    locale?: string | null
    hourFormat?: '12h' | '24h' | null
  }>
}

// Script joiners (ZWJ/ZWNJ) are legitimate within Indic/Arabic words; other
// invisible formatting, bidirectional overrides/isolates, line/paragraph
// separators, surrogates, and control characters are rejected.
const UNSAFE_CONTROLS_RE = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]|(?![\u200C\u200D])\p{Cf}/u
const MISPLACED_JOINER_RE = /(?:^|[^\p{L}\p{M}])[\u200C\u200D]|[\u200C\u200D](?:$|[^\p{L}\p{M}])/u
const HAS_LETTER_RE = /\p{L}/u
const HAS_LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u
const MAX_TEXT_CODE_UNITS = 1024
const NAME_CHARACTERS_RE = /^[\p{L}\p{M} .,'\u2018\u2019\u00B7\u30FB\u2010\u2011\u200C\u200D-]+$/u
const CITY_CHARACTERS_RE =
  /^[\p{L}\p{M}\p{N} .,'\u2018\u2019\u00B7\u30FB\u2010\u2011\u200C\u200D()&/-]+$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Checks whether a raw string contains disallowed Unicode control characters,
 * bidirectional overrides/isolates, zero-width non-joiner/joiner misuse, lone
 * surrogates, line/paragraph separators, or angle brackets (`<`, `>`).
 */
export function hasUnsafeUnicodeOrMarkup(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > MAX_TEXT_CODE_UNITS) return true
  return UNSAFE_CONTROLS_RE.test(raw) || /[<>]/.test(raw) || MISPLACED_JOINER_RE.test(raw)
}

/**
 * Bounds input length before normalization, rejects unsafe Unicode controls,
 * bidi overrides, misplaced joiners, lone surrogates, and `<`/`>`, collapses
 * Unicode spaces (`\p{Zs}`), normalizes to NFC, and verifies code-point length.
 */
export function validateSafeText(
  raw: unknown,
  { min = 1, max = 240, optional = false }: SafeTextOptions = {},
): SafeTextResult {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || min > max) {
    return Object.freeze({ text: '', valid: false })
  }
  if (raw == null && optional) return Object.freeze({ text: '', valid: true })
  if (
    typeof raw !== 'string' ||
    raw.length > Math.max(max * 4, 32) ||
    hasUnsafeUnicodeOrMarkup(raw)
  ) {
    return Object.freeze({ text: '', valid: false })
  }
  const text = raw.trim().replace(/\p{Zs}+/gu, ' ').normalize('NFC')
  const length = [...text].length
  return Object.freeze({ text, valid: length >= min && length <= max })
}

/**
 * Validates international human names across Latin, Devanagari, Arabic,
 * Cyrillic, Han, Hangul, Katakana/Hiragana, and supplementary Unicode scripts.
 * Single-character Han/Hangul names are permitted; other scripts require at
 * least 2 Unicode letters. Rejects digits, emoji, markup, and control chars.
 */
export function validatePersonName(raw: unknown): SafeTextResult {
  const [min, max] = VALIDATION_LIMITS.fullName
  const res = validateSafeText(raw, { min, max })
  if (
    !res.valid ||
    !HAS_LETTER_RE.test(res.text) ||
    !NAME_CHARACTERS_RE.test(res.text) ||
    ([...res.text.matchAll(/\p{L}/gu)].length < 2 &&
      !/[\p{Script=Han}\p{Script=Hangul}]/u.test(res.text))
  ) {
    return Object.freeze({ text: '', valid: false })
  }
  return res
}

/**
 * Validates international city or locality names (supports Unicode letters,
 * numbers for districts/sectors, parentheses, apostrophes, and hyphens).
 */
export function validateCity(raw: unknown): SafeTextResult {
  const [min, max] = VALIDATION_LIMITS.city
  const res = validateSafeText(raw, { min, max })
  if (!res.valid || !HAS_LETTER_RE.test(res.text) || !CITY_CHARACTERS_RE.test(res.text)) {
    return Object.freeze({ text: '', valid: false })
  }
  return res
}

/**
 * Validates printable international street addresses without destructively
 * rewriting data (preserves apostrophes/punctuation as data, rejects HTML `<`/`>`,
 * control characters, numeric-only inputs, and overly short/long strings).
 */
export function validateAddress(raw: unknown): SafeTextResult {
  const [min, max] = VALIDATION_LIMITS.addressLine1
  const res = validateSafeText(raw, { min, max })
  if (
    !res.valid ||
    !HAS_LETTER_RE.test(res.text) ||
    [...res.text.matchAll(/[\p{L}\p{N}]/gu)].length < 3
  ) {
    return Object.freeze({ text: '', valid: false })
  }
  return res
}

/**
 * Validates optional printable contact text (such as address line 2,
 * state/region, or postal code). Empty/null/undefined values are allowed.
 */
export function validateOptionalText(
  raw: unknown,
  { max = 240, requireLetter = false }: { max?: number; requireLetter?: boolean } = {},
): SafeTextResult {
  const res = validateSafeText(raw, { min: 0, max, optional: true })
  if (!res.valid) return res
  if (res.text && !(requireLetter ? HAS_LETTER_RE : HAS_LETTER_OR_NUMBER_RE).test(res.text)) {
    return Object.freeze({ text: '', valid: false })
  }
  return res
}

/**
 * Validates bounded display preferences (`timezone`, `locale`, `hourFormat`,
 * and optional country fields) against canonical IANA/BCP 47 rules.
 */
export function validateDisplayPreferences(
  input: DisplayPreferencesInput | unknown = {},
): DisplayPreferencesValidationResult {
  const value = isRecord(input) ? input : {}
  const errors: Record<string, string> = {}
  const normalized: {
    timezone?: string | null
    locale?: string | null
    hourFormat?: '12h' | '24h' | null
    countryCode?: string
  } = {}

  const tzKey = Object.hasOwn(value, 'timezone')
    ? 'timezone'
    : Object.hasOwn(value, 'timeZone')
      ? 'timeZone'
      : null
  if (tzKey && value[tzKey] !== undefined) {
    if (value[tzKey] === null) {
      normalized.timezone = null
    } else {
      const [min, max] = VALIDATION_LIMITS.timezone
      const text = validateSafeText(value[tzKey], { min, max })
      if (
        !text.valid ||
        (text.text !== 'UTC' && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(text.text)) ||
        !isValidIanaTimeZone(text.text) ||
        !isKnownIanaTimeZone(text.text)
      ) {
        errors.timezone = VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE
      } else {
        normalized.timezone = text.text
      }
    }
  }

  if (Object.hasOwn(value, 'locale') && value.locale !== undefined) {
    if (value.locale === null) {
      normalized.locale = null
    } else {
      const [min, max] = VALIDATION_LIMITS.locale
      const text = validateSafeText(value.locale, { min, max })
      try {
        if (!text.valid || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(text.text)) {
          throw new Error('invalid_locale')
        }
        const locales = Intl.getCanonicalLocales(text.text)
        if (locales.length !== 1 || locales[0].length < min || locales[0].length > max) {
          throw new Error('invalid_locale')
        }
        normalized.locale = locales[0]
      } catch {
        errors.locale = VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE
      }
    }
  }

  const hfKey = Object.hasOwn(value, 'hourFormat')
    ? 'hourFormat'
    : Object.hasOwn(value, 'hour_format')
      ? 'hour_format'
      : null
  if (hfKey && value[hfKey] !== undefined) {
    if (value[hfKey] === null) {
      normalized.hourFormat = null
    } else {
      const text = validateSafeText(value[hfKey], { min: 3, max: 3 })
      if (!text.valid || (text.text !== '12h' && text.text !== '24h')) {
        errors.hourFormat = VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE
      } else {
        normalized.hourFormat = text.text
      }
    }
  }

  const countryFields = ['country', 'country_code', 'countryCode'].filter(
    (field) => Object.hasOwn(value, field) && value[field] != null && value[field] !== '',
  )
  if (countryFields.length > 0) {
    const resolved = countryFields.map((field) => resolveCountryCode(value[field]))
    if (resolved.some((code) => !code || code !== resolved[0])) {
      errors.country = VALIDATION_ERROR_CODES.INVALID_COUNTRY
    } else if (resolved[0]) {
      normalized.countryCode = resolved[0]
      if (normalized.timezone && !timezoneBelongsToCountry(normalized.timezone, resolved[0])) {
        delete normalized.timezone
        errors.timezone = VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE
      }
    }
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    errors: Object.freeze(errors),
    normalized: Object.freeze(normalized),
  })
}

/**
 * Validates a generic international contact form payload (name, country, city,
 * address, optional locality fields, and display preferences) without mutating
 * the caller's object and returning frozen, bounded error codes.
 */
export function validateContactFields(
  input: ContactFieldsInput | unknown = {},
): ContactFieldsValidationResult {
  const value = isRecord(input) ? input : {}
  const errors: Record<string, string> = {}

  const fullName = validatePersonName(value.fullName)
  if (!fullName.valid) errors.fullName = VALIDATION_ERROR_CODES.INVALID_FULL_NAME

  const suppliedCountries = [value.countryCode, value.country].filter(
    (raw) => raw != null && raw !== '',
  )
  const resolvedCountries = suppliedCountries.map(resolveCountryCode)
  const countryCode = resolvedCountries[0] || null
  if (!countryCode || resolvedCountries.some((code) => code !== countryCode)) {
    errors.country = VALIDATION_ERROR_CODES.INVALID_COUNTRY
  }

  const city = validateCity(value.city)
  if (!city.valid) errors.city = VALIDATION_ERROR_CODES.INVALID_CITY

  const addressLine1 = validateAddress(value.addressLine1)
  if (!addressLine1.valid) errors.addressLine1 = VALIDATION_ERROR_CODES.INVALID_ADDRESS

  const addressLine2 = validateOptionalText(value.addressLine2, {
    max: VALIDATION_LIMITS.addressLine2[1],
  })
  if (!addressLine2.valid) errors.addressLine2 = VALIDATION_ERROR_CODES.INVALID_OPTIONAL_TEXT

  const stateRegion = validateOptionalText(value.stateRegion, {
    max: VALIDATION_LIMITS.stateRegion[1],
    requireLetter: true,
  })
  if (!stateRegion.valid) errors.stateRegion = VALIDATION_ERROR_CODES.INVALID_OPTIONAL_TEXT

  const postalCode = validateOptionalText(value.postalCode, {
    max: VALIDATION_LIMITS.postalCode[1],
  })
  if (!postalCode.valid) errors.postalCode = VALIDATION_ERROR_CODES.INVALID_OPTIONAL_TEXT

  const prefs = validateDisplayPreferences({
    countryCode: errors.country ? null : countryCode,
    timezone: value.timezone,
    locale: value.locale,
    hourFormat: value.hourFormat,
  })
  Object.assign(errors, prefs.errors)

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    errors: Object.freeze(errors),
    normalized: Object.freeze({
      fullName: fullName.text,
      countryCode: errors.country ? null : countryCode,
      city: city.text,
      addressLine1: addressLine1.text,
      addressLine2: addressLine2.text,
      stateRegion: stateRegion.text,
      postalCode: postalCode.text,
      ...(prefs.normalized.timezone !== undefined ? { timezone: prefs.normalized.timezone } : {}),
      ...(prefs.normalized.locale !== undefined ? { locale: prefs.normalized.locale } : {}),
      ...(prefs.normalized.hourFormat !== undefined
        ? { hourFormat: prefs.normalized.hourFormat }
        : {}),
    }),
  })
}
