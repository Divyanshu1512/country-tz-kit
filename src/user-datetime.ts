import { getCountryByCode, isKnownIanaTimeZone, resolveCountryCode } from './country-metadata.js'
import { GENERATED_COUNTRY_ZONES, GENERATED_IANA_TIMEZONE_LINKS, GENERATED_IANA_TIMEZONES } from './generated/metadata.js'

export const INVALID_DATE_TIME = '\u2014'
const UNSAFE_INPUT = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:\d{2})$/

export type HourFormat = '12h' | '24h' | ''
export type DateStyleOption = 'full' | 'long' | 'medium' | 'short' | null
export type TimeStyleOption = 'full' | 'long' | 'medium' | 'short' | null | false

export interface UserDateTimeProfileInput {
  country_code?: string | null
  country?: string | null
  countryCode?: string | null
  timezone?: string | null
  timeZone?: string | null
  locale?: string | null
  hour_format?: string | null
  hourFormat?: string | null
}

export interface CountrySelectionPreferencesInput {
  countryCode?: string | null
  currentTimeZone?: string | null
  browserTimeZone?: string | null
}

export interface CountrySelectionPreferences {
  readonly countryCode: string
  readonly timeZone: string
  readonly locale: string
  readonly requiresTimeZoneSelection: boolean
}

export interface ResolveUserDateTimeOptions {
  profile?: UserDateTimeProfileInput | null
  browserTimeZone?: string | null
  browserLocale?: string | null
}

export interface UserDateTimePreferences {
  readonly countryCode: string
  readonly timeZone: string
  readonly locale: string
  readonly hourFormat: HourFormat
}

export interface FormatUserDateTimeOptions {
  timeZone?: string | null
  locale?: string | null
  hourFormat?: HourFormat | string | null
  includeSeconds?: boolean
  dateStyle?: DateStyleOption
  timeStyle?: TimeStyleOption
  invalidFallback?: string
}

const COUNTRY_LOCALES: Readonly<Record<string, string>> = Object.freeze({
  AE: 'en-AE', AU: 'en-AU', BR: 'pt-BR', CA: 'en-CA', CH: 'de-CH',
  CN: 'zh-CN', DE: 'de-DE', ES: 'es-ES', FR: 'fr-FR', GB: 'en-GB',
  HK: 'zh-HK', ID: 'id-ID', IN: 'en-IN', IT: 'it-IT', JP: 'ja-JP',
  KR: 'ko-KR', MX: 'es-MX', MY: 'ms-MY', NL: 'nl-NL', NZ: 'en-NZ',
  PT: 'pt-PT', RU: 'ru-RU', SG: 'en-SG', TH: 'th-TH', TR: 'tr-TR',
  TW: 'zh-TW', US: 'en-US', VN: 'vi-VN', ZA: 'en-ZA',
})

let currentCountryZoneKeys: ReadonlySet<string> | undefined

function canonicalTimeZoneKey(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return ''
  }
}

function getCurrentCountryZoneKeys(): ReadonlySet<string> {
  currentCountryZoneKeys ??= new Set(Object.values(GENERATED_COUNTRY_ZONES).flat().flatMap(
    (zone) => [zone.toLowerCase(), canonicalTimeZoneKey(zone).toLowerCase()],
  ))
  return currentCountryZoneKeys
}

/**
 * Validates that a value is `'UTC'` or a recognized IANA `Area/Location`
 * timezone identifier supported by the runtime's `Intl.DateTimeFormat`.
 * Fixed numeric offsets such as `'+05:30'` or `'GMT+5:30'` are rejected.
 */
export function isValidIanaTimeZone(value: unknown): boolean {
  return Boolean(normalizeIanaTimeZone(value))
}

/**
 * Returns the trimmed IANA timezone identifier if valid, or `''` otherwise.
 */
export function normalizeIanaTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || UNSAFE_INPUT.test(value)) return ''
  const text = value.trim()
  if (/^utc$/i.test(text)) return 'UTC'
  if (!text.includes('/') || /^(?:UTC|GMT)?[+-]\d/i.test(text)) return ''
  return canonicalTimeZoneKey(text) ? text : ''
}

/**
 * Reads the runtime's resolved IANA timezone without any network or geolocation APIs.
 */
export function getBrowserTimeZone(): string {
  try {
    return normalizeIanaTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return ''
  }
}

/**
 * Canonicalizes a bounded BCP 47 locale tag using `Intl.getCanonicalLocales`.
 */
export function normalizeLocale(value: unknown): string {
  if (typeof value !== 'string' || value.length > 35 || UNSAFE_INPUT.test(value)) return ''
  const text = value.trim()
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(text)) return ''
  try {
    return Intl.getCanonicalLocales(text)[0] || ''
  } catch {
    return ''
  }
}

/**
 * Reads the browser's preferred locale (`navigator.language`) when available.
 */
export function getBrowserLocale(): string {
  try {
    return normalizeLocale(globalThis.navigator?.language || '')
  } catch {
    return ''
  }
}

/**
 * Derives a default BCP 47 locale for a given country code or name.
 */
export function deriveLocaleForCountry(countryValue: unknown): string {
  const countryCode = resolveCountryCode(countryValue)
  if (!countryCode) return ''
  const configured = COUNTRY_LOCALES[countryCode]
  if (configured) return configured
  return normalizeLocale(`en-${countryCode}`)
}

/**
 * Returns `true` for countries spanning multiple IANA timezones (such as US,
 * CA, AU, BR, MX, RU, ID, ES, PT, NZ, CL, EC, KZ, MY).
 */
export function isMultiTimezoneCountry(countryValue: unknown): boolean {
  const countryCode = resolveCountryCode(countryValue)
  return Boolean(countryCode && (GENERATED_COUNTRY_ZONES[countryCode]?.length ?? 0) > 1)
}

/**
 * Returns the curated list of IANA timezones associated with a country.
 */
export function getCountryTimezoneOptions(countryValue: unknown): readonly string[] {
  const countryCode = resolveCountryCode(countryValue)
  if (!countryCode) return Object.freeze([])
  return Object.freeze((GENERATED_COUNTRY_ZONES[countryCode] ?? []).filter(isValidIanaTimeZone))
}

/**
 * Returns the single unambiguous default IANA timezone for single-timezone
 * countries, or `''` for multi-timezone or unknown countries (never guesses a
 * capital city for multi-timezone countries).
 */
export function getCountryDefaultTimezone(countryValue: unknown): string {
  const countryCode = resolveCountryCode(countryValue)
  const zones = countryCode ? GENERATED_COUNTRY_ZONES[countryCode] : undefined
  return zones?.length === 1 ? normalizeIanaTimeZone(zones[0]) : ''
}

/**
 * Checks whether an IANA timezone belongs to a given country using `Intl`
 * and the pinned IANA links for names retired from the current country table.
 */
export function timezoneBelongsToCountry(timeZone: unknown, countryValue: unknown): boolean {
  const normalized = normalizeIanaTimeZone(timeZone)
  if (!normalized) return false
  const key = canonicalTimeZoneKey(normalized)
  if (!key) return false
  const optionKeys = getCountryTimezoneOptions(countryValue).map(canonicalTimeZoneKey)
  if (optionKeys.includes(key)) return true

  const zoneName = normalized.toLowerCase()
  const target = GENERATED_IANA_TIMEZONE_LINKS[zoneName]
  if (!target || !optionKeys.length) return false

  // An Intl-equivalent zone.tab entry keeps its existing country membership.
  const currentKeys = getCurrentCountryZoneKeys()
  if (currentKeys.has(zoneName) || currentKeys.has(key.toLowerCase())) return false
  return optionKeys.includes(canonicalTimeZoneKey(target))
}

/**
 * Returns a sorted list of timezone identifiers supported by both the runtime
 * and the pinned IANA snapshot, including `'UTC'` and known aliases.
 */
export function getTrustedIanaTimeZones(): readonly string[] {
  const values = new Set<string>(['UTC'])
  try {
    Intl.supportedValuesOf?.('timeZone').forEach((value) => values.add(value))
  } catch {
    // Fall back to curated local lists on older runtimes.
  }
  GENERATED_IANA_TIMEZONES.forEach((value) => values.add(value))
  Object.values(GENERATED_COUNTRY_ZONES).flat().forEach((value) => values.add(value))
  return Object.freeze(
    [...values].filter((value) => isValidIanaTimeZone(value) && isKnownIanaTimeZone(value)).sort(),
  )
}

/**
 * Resolves timezone & locale suggestions when a user selects a country in a UI.
 * For multi-timezone countries, `timeZone` stays `''` and
 * `requiresTimeZoneSelection` is `true` unless the current or browser timezone
 * actually belongs to that country.
 */
export function resolveCountrySelectionPreferences({
  countryCode,
  currentTimeZone = '',
  browserTimeZone = getBrowserTimeZone(),
}: CountrySelectionPreferencesInput = {}): CountrySelectionPreferences {
  const normalizedCountry = resolveCountryCode(countryCode)
  if (!normalizedCountry || !getCountryByCode(normalizedCountry)) {
    return Object.freeze({
      countryCode: '',
      timeZone: '',
      locale: '',
      requiresTimeZoneSelection: false,
    })
  }
  const current = normalizeIanaTimeZone(currentTimeZone)
  const browser = normalizeIanaTimeZone(browserTimeZone)
  let timeZone = ''
  if (timezoneBelongsToCountry(current, normalizedCountry)) timeZone = current
  else if (timezoneBelongsToCountry(browser, normalizedCountry)) timeZone = browser
  else timeZone = getCountryDefaultTimezone(normalizedCountry)

  return Object.freeze({
    countryCode: normalizedCountry,
    timeZone,
    locale: deriveLocaleForCountry(normalizedCountry),
    requiresTimeZoneSelection: !timeZone,
  })
}

/**
 * Resolves effective display preferences using deterministic precedence:
 *   1. Valid saved user timezone permitted by the selected country, if any
 *   2. Valid browser timezone permitted by the selected country, if any
 *   3. Single-timezone country default (never guessed for multi-zone countries)
 *   4. `'UTC'`
 */
export function resolveUserDateTimePreferences({
  profile = {},
  browserTimeZone = getBrowserTimeZone(),
  browserLocale = getBrowserLocale(),
}: ResolveUserDateTimeOptions = {}): UserDateTimePreferences {
  const safeProfile = profile && typeof profile === 'object' ? profile : {}
  const countryCode =
    resolveCountryCode(
      safeProfile.countryCode || safeProfile.country_code || safeProfile.country,
    ) || ''
  const permittedZone = (value: unknown) => {
    const zone = normalizeIanaTimeZone(value)
    return countryCode && !timezoneBelongsToCountry(zone, countryCode) ? '' : zone
  }
  const savedTimeZone = permittedZone(safeProfile.timeZone || safeProfile.timezone)
  const normalizedBrowserTimeZone = permittedZone(browserTimeZone)
  const countryDefault = getCountryDefaultTimezone(countryCode)
  const timeZone =
    savedTimeZone || normalizedBrowserTimeZone || countryDefault || 'UTC'
  const locale =
    normalizeLocale(safeProfile.locale) ||
    deriveLocaleForCountry(countryCode) ||
    normalizeLocale(browserLocale) ||
    'en-US'
  const rawHourFormat = safeProfile.hourFormat || safeProfile.hour_format
  const hourFormat: HourFormat =
    rawHourFormat === '12h' || rawHourFormat === '24h' ? rawHourFormat : ''
  return Object.freeze({ countryCode, timeZone, locale, hourFormat })
}

function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  if (typeof value !== 'string' || value.length > 48 || UNSAFE_INPUT.test(value)) return null
  const match = ISO_INSTANT.exec(value.trim())
  if (!match) return null
  const [, yyyy, mm, dd, hh, min, sec = '0', fraction = '', offset] = match
  const [year, month, day, hour, minute, second] = [yyyy, mm, dd, hh, min, sec].map(Number)
  const offsetHours = offset.length === 1 ? 0 : Number(offset.slice(1, 3))
  const offsetMinutes = offset.length === 1 ? 0 : Number(offset.slice(4))
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 ||
      second > 59 || offsetHours > 23 || offsetMinutes > 59) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, Number(fraction.padEnd(3, '0').slice(0, 3)))
  if (date.getUTCDate() !== day) return null
  const sign = offset.startsWith('-') ? -1 : 1
  return new Date(date.getTime() - sign * (offsetHours * 60 + offsetMinutes) * 60_000)
}

/**
 * Formats a UTC instant (ISO string, epoch milliseconds, or `Date`) in the
 * target IANA timezone and locale using `Intl.DateTimeFormat`, without ever
 * mutating the source value. Invalid timestamps return `invalidFallback` (`'—'`).
 */
export function formatUserDateTime(
  timestamp: string | number | Date | null | undefined,
  {
    timeZone = 'UTC',
    locale = 'en-US',
    hourFormat = '',
    includeSeconds = true,
    dateStyle = 'medium',
    timeStyle,
    invalidFallback = INVALID_DATE_TIME,
  }: FormatUserDateTimeOptions = {},
): string {
  const date = parseTimestamp(timestamp)
  if (!date) return invalidFallback
  const safeTimeZone = normalizeIanaTimeZone(timeZone) || 'UTC'
  const safeLocale = normalizeLocale(locale) || 'en-US'
  const options: Intl.DateTimeFormatOptions = { timeZone: safeTimeZone }
  if (dateStyle) options.dateStyle = dateStyle
  if (timeStyle !== null && timeStyle !== false) {
    options.timeStyle = timeStyle || (includeSeconds ? 'medium' : 'short')
  }
  if (hourFormat === '12h') options.hour12 = true
  if (hourFormat === '24h') options.hour12 = false
  try {
    return new Intl.DateTimeFormat(safeLocale, options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: includeSeconds ? 'medium' : 'short',
    }).format(date)
  }
}

/**
 * Formats only the localized time component of a UTC instant.
 */
export function formatUserTime(
  timestamp: string | number | Date | null | undefined,
  preferences: FormatUserDateTimeOptions = {},
): string {
  return formatUserDateTime(timestamp, {
    ...preferences,
    dateStyle: null,
    timeStyle: preferences.timeStyle ?? (preferences.includeSeconds === false ? 'short' : 'medium'),
  })
}

/**
 * Formats only the localized calendar date component of a UTC instant.
 */
export function formatUserDate(
  timestamp: string | number | Date | null | undefined,
  preferences: FormatUserDateTimeOptions = {},
): string {
  return formatUserDateTime(timestamp, {
    ...preferences,
    dateStyle: preferences.dateStyle ?? 'medium',
    timeStyle: null,
  })
}
