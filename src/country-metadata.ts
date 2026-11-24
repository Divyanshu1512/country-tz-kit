import {
  DATASET_PROVENANCE,
  GENERATED_IANA_TIMEZONE_LINKS,
  GENERATED_IANA_TIMEZONES,
  GENERATED_RAW_COUNTRIES,
  type DatasetProvenance,
} from './generated/metadata.js'

export { DATASET_PROVENANCE, type DatasetProvenance }

export interface CountryMetadata {
  readonly code: string
  readonly name: string
  readonly callingCode: string | null
  readonly dialingCodes: readonly string[]
}

export interface DialingOption {
  readonly id: string
  readonly countryCode: string
  readonly countryName: string
  readonly callingCode: string
  readonly label: string
}

export interface ResolveDialingSelectionOptions {
  countryValue?: string | null
  callingCode?: string | null
  fallbackCountryCode?: string
}

export type DialingSelectionResult =
  | Readonly<{ status: 'selected'; id: string }>
  | Readonly<{ status: 'ambiguous' | 'conflict' | 'invalid' | 'unset'; id: '' }>

/**
 * Canonical IANA timezone identifiers bundled from the reproducible offline
 * generator (`Intl.supportedValuesOf('timeZone')` + `'UTC'`).
 */
export const IANA_TIMEZONES: readonly string[] = GENERATED_IANA_TIMEZONES

const IANA_TIMEZONE_SET = new Set(IANA_TIMEZONES.map((value) => value.toLowerCase()))

/**
 * Checks whether a string matches a known canonical IANA timezone identifier
 * in the bundled offline snapshot (case-insensitive), also accepting modern
 * IANA aliases whose runtime resolution or pinned IANA target is in the snapshot
 * while rejecting fixed numeric offsets (`+05:30`, `GMT+5:30`).
 */
export function isKnownIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80 || UNSAFE_LOOKUP_TEXT.test(value)) {
    return false
  }
  const trimmed = value.trim()
  if (!trimmed) return false
  if (IANA_TIMEZONE_SET.has(trimmed.toLowerCase())) return true
  if (trimmed !== 'UTC' && (!trimmed.includes('/') || /^(?:UTC|GMT)?[+-]\d/i.test(trimmed))) {
    return false
  }
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions()
      .timeZone
    const linked = GENERATED_IANA_TIMEZONE_LINKS[trimmed.toLowerCase()]
    return IANA_TIMEZONE_SET.has(resolved.toLowerCase()) ||
      (linked !== undefined && IANA_TIMEZONE_SET.has(linked.toLowerCase()))
  } catch {
    return false
  }
}

/**
 * All 249 officially assigned ISO 3166-1 alpha-2 countries sorted alphabetically
 * by English display name, with zero runtime network dependencies.
 */
export const ISO_COUNTRIES: readonly CountryMetadata[] = Object.freeze(
  GENERATED_RAW_COUNTRIES.map(([code, name, dialingCodes]) =>
    Object.freeze({
      code,
      name,
      callingCode: dialingCodes[0] || null,
      dialingCodes: Object.freeze([...dialingCodes]),
    }),
  ),
)

const COUNTRY_BY_CODE = new Map<string, CountryMetadata>(
  ISO_COUNTRIES.map((country) => [country.code, country]),
)
const COUNTRY_CODE_BY_NAME = new Map<string, string>(
  ISO_COUNTRIES.map((country) => [lookupKey(country.name), country.code]),
)
const CALLING_CODES = new Set<string>(ISO_COUNTRIES.flatMap((country) => country.dialingCodes))

// Reject C0/C1 controls, lone surrogates, format/bidi characters, line/paragraph separators, and angle brackets.
const UNSAFE_LOOKUP_TEXT = /[\p{Cc}\p{Cs}\p{Cf}\p{Zl}\p{Zp}<>]/u

const COUNTRY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'bolivia plurinational state of': 'BO',
  'bolivia (plurinational state of)': 'BO',
  'brunei darussalam': 'BN',
  'burma': 'MM',
  'cabo verde': 'CV',
  'cape verde': 'CV',
  'congo, the democratic republic of the': 'CD',
  "cote d'ivoire": 'CI',
  'czech republic': 'CZ',
  'democratic people s republic of korea': 'KP',
  'democratic republic of congo': 'CD',
  'democratic republic of the congo': 'CD',
  'dr congo': 'CD',
  'east timor': 'TL',
  'federated states of micronesia': 'FM',
  'great britain': 'GB',
  'heard island and mcdonald islands': 'HM',
  'holy see': 'VA',
  'hong kong': 'HK',
  'iran islamic republic of': 'IR',
  'iran (islamic republic of)': 'IR',
  'ivory coast': 'CI',
  "korea (democratic people's republic of)": 'KP',
  'korea (republic of)': 'KR',
  'lao people s democratic republic': 'LA',
  "lao people's democratic republic": 'LA',
  'macao': 'MO',
  'macau': 'MO',
  'macedonia': 'MK',
  'micronesia federated states of': 'FM',
  'micronesia (federated states of)': 'FM',
  'moldova republic of': 'MD',
  'moldova (republic of)': 'MD',
  'myanmar': 'MM',
  'north korea': 'KP',
  'palestine': 'PS',
  'republic of korea': 'KR',
  'republic of moldova': 'MD',
  'republic of the congo': 'CG',
  'russian federation': 'RU',
  'saint barthelemy': 'BL',
  'saint helena': 'SH',
  'saint helena, ascension and tristan da cunha': 'SH',
  'saint kitts and nevis': 'KN',
  'saint lucia': 'LC',
  'saint martin': 'MF',
  'saint pierre and miquelon': 'PM',
  'saint vincent and the grenadines': 'VC',
  'sao tome and principe': 'ST',
  'south korea': 'KR',
  'state of palestine': 'PS',
  'swaziland': 'SZ',
  'syrian arab republic': 'SY',
  'taiwan province of china': 'TW',
  'taiwan, province of china': 'TW',
  'tanzania united republic of': 'TZ',
  'tanzania, united republic of': 'TZ',
  'the bahamas': 'BS',
  'the gambia': 'GM',
  'turkey': 'TR',
  'turkiye': 'TR',
  'u s': 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  'uae': 'AE',
  'uk': 'GB',
  'united kingdom of great britain and northern ireland': 'GB',
  'united republic of tanzania': 'TZ',
  'united states minor outlying islands': 'UM',
  'united states of america': 'US',
  'united states virgin islands': 'VI',
  'usa': 'US',
  'vatican': 'VA',
  'venezuela bolivarian republic of': 'VE',
  'venezuela (bolivarian republic of)': 'VE',
  'viet nam': 'VN',
})

for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
  COUNTRY_CODE_BY_NAME.set(lookupKey(alias), code)
}

const DIALING_DESTINATION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'SH:+247': 'Ascension Island',
  'SH:+290': 'Saint Helena and Tristan da Cunha',
})

/**
 * Unique per-(country, callingCode) dialing selector options preserving shared
 * calling codes (e.g. `US:+1`, `CA:+1`, `BS:+1`) and multi-code territories
 * (`SH:+290`, `SH:+247`).
 */
export const DIALING_OPTIONS: readonly DialingOption[] = Object.freeze(
  ISO_COUNTRIES.flatMap((country) =>
    country.dialingCodes.map((callingCode) => {
      const id = `${country.code}:${callingCode}`
      const countryName = DIALING_DESTINATION_NAMES[id] || country.name
      return Object.freeze({
        id,
        countryCode: country.code,
        countryName,
        callingCode,
        label: `${callingCode} ${countryName}`,
      })
    }),
  ),
)

const DIALING_OPTION_BY_ID = new Map<string, DialingOption>(
  DIALING_OPTIONS.map((option) => [option.id, option]),
)

/**
 * Looks up immutable ISO 3166-1 country metadata by 2-letter alpha-2 code.
 */
export function getCountryByCode(code: unknown): CountryMetadata | null {
  if (typeof code !== 'string' || code.length > 16 || UNSAFE_LOOKUP_TEXT.test(code)) return null
  const text = code.trim()
  return /^[a-z]{2}$/i.test(text) ? COUNTRY_BY_CODE.get(text.toUpperCase()) || null : null
}

/**
 * Resolves an ISO 3166-1 alpha-2 code from a code, canonical display name,
 * diacritic variant, or recognized legacy alias. Returns `null` on unknown or
 * unsafe input rather than guessing.
 */
export function resolveCountryCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 160 || UNSAFE_LOOKUP_TEXT.test(value)) {
    return null
  }
  const text = value.trim()
  if (!text) return null
  const country = getCountryByCode(text)
  if (country) return country.code
  return COUNTRY_CODE_BY_NAME.get(lookupKey(text)) || null
}

/**
 * Normalizes a saved country value to its ISO 3166-1 alpha-2 code when known.
 * Unknown non-empty values are preserved verbatim for caller correction rather
 * than silently switching to a different country.
 */
export function normalizeCountryValue(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' && value.length <= 160 && !UNSAFE_LOOKUP_TEXT.test(value)
    ? value.trim()
    : ''
  if (!text) return fallback
  return resolveCountryCode(text) || text
}

/**
 * Looks up a disambiguated dialing option by its stable `CC:+NNN` identifier.
 */
export function getDialingOption(id: unknown): DialingOption | null {
  if (typeof id !== 'string' || id.length > 16 || UNSAFE_LOOKUP_TEXT.test(id)) return null
  return DIALING_OPTION_BY_ID.get(id.trim()) || null
}

/**
 * Validates and normalizes an ITU-T E.164 calling code against known supported
 * country calling codes (e.g. `'91'` -> `'+91'`, `' +44 '` -> `'+44'`).
 */
export function normalizeCallingCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 16 || UNSAFE_LOOKUP_TEXT.test(value)) {
    return null
  }
  const text = value.trim()
  if (!/^\+?[1-9][0-9]{0,2}$/.test(text)) return null
  const code = text.startsWith('+') ? text : `+${text}`
  return CALLING_CODES.has(code) ? code : null
}

/**
 * Returns `true` when `value` is a supported calling code (`+1`..`+998`).
 */
export function isSupportedCallingCode(value: unknown): boolean {
  return typeof value === 'string' && CALLING_CODES.has(value)
}

/**
 * Resolves a disambiguated `DIALING_OPTIONS` id (`CC:+NNN`) from a saved country
 * value and/or calling code, preserving country disambiguation for shared codes
 * like `+1` (`US:+1` vs `CA:+1`).
 */
export function resolveDialingSelectionResult({
  countryValue,
  callingCode,
  fallbackCountryCode = '',
}: ResolveDialingSelectionOptions = {}): DialingSelectionResult {
  const countrySupplied = countryValue != null && countryValue !== ''
  const callingCodeSupplied = callingCode != null && callingCode !== ''
  const countryCode = resolveCountryCode(countryValue)
  const normalizedCallingCode = normalizeCallingCode(callingCode)
  if ((countrySupplied && !countryCode) || (callingCodeSupplied && !normalizedCallingCode)) {
    return Object.freeze({ status: 'invalid', id: '' })
  }
  const selectedCountry = countryCode || (!callingCodeSupplied && resolveCountryCode(fallbackCountryCode))
  if (!selectedCountry && !normalizedCallingCode) return Object.freeze({ status: 'unset', id: '' })
  const matches = DIALING_OPTIONS.filter((option) =>
    (!selectedCountry || option.countryCode === selectedCountry) &&
    (!normalizedCallingCode || option.callingCode === normalizedCallingCode),
  )
  if (matches.length === 1) return Object.freeze({ status: 'selected', id: matches[0].id })
  if (matches.length > 1) return Object.freeze({ status: 'ambiguous', id: '' })
  return Object.freeze({ status: countryCode && callingCodeSupplied ? 'conflict' : 'unset', id: '' })
}

/** Returns the unique compatible selection ID, or an empty string. */
export function resolveDialingSelection(options: ResolveDialingSelectionOptions = {}): string {
  return resolveDialingSelectionResult(options).id
}

function lookupKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010\u2011]/g, '-')
    .replace(/&/g, ' and ')
    .replace(/\p{Zs}+/gu, ' ')
    .trim()
}
