#!/usr/bin/env node
/**
 * Reproducible offline dataset generator for country-tz-kit.
 *
 * Verified upstream sources (zero ODbL-1.0 dependencies; zero private databases):
 *  1. Official 249 ISO 3166-1 alpha-2 codes + English short names via Node.js
 *     ICU / Unicode CLDR `Intl.DisplayNames(['en'], { type: 'region' })` (Unicode-3.0).
 *  2. Country calling codes via `libphonenumber-js` (MIT, derived from Google
 *     libphonenumber metadata under Apache-2.0), plus ITU-T E.164 dialing codes
 *     for uninhabited/special ISO 3166-1 territories absent from libphonenumber-js.
 *  3. Canonical IANA Time Zone Database identifiers via Node.js
 *     `Intl.supportedValuesOf('timeZone')` + `'UTC'` (Public Domain IANA tzdb).
 *
 * Usage:
 *   node scripts/regenerate-metadata.mjs          # Regenerate src/generated/metadata.ts
 *   node scripts/regenerate-metadata.mjs --check  # Fail if checked-in file differs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_PATH = join(ROOT, 'src', 'generated', 'metadata.ts')
const CHECK_ONLY = process.argv.includes('--check')
const TOOLCHAIN = Object.freeze({
  node: '24.15.0',
  icu: '78.2',
  cldr: '48.0',
  tz: '2026a',
})

const lpPkg = JSON.parse(
  readFileSync(join(ROOT, 'node_modules', 'libphonenumber-js', 'package.json'), 'utf8'),
)
const mismatches = Object.entries(TOOLCHAIN).filter(([key, value]) => process.versions[key] !== value)
if (mismatches.length || lpPkg.version !== '1.13.17') {
  throw new Error('Metadata generation requires Node 24.15.0, ICU 78.2, CLDR 48.0, tzdb 2026a, and libphonenumber-js 1.13.17.')
}

const zoneTable = readFileSync(join(ROOT, 'data', 'iana-zone.tab'), 'utf8')
  .replace(/\r\n/g, '\n')
const zoneTableSha256 = createHash('sha256').update(zoneTable).digest('hex')
const expectedZoneTableSha256 = '586b4207e6c76722de82adcda6bf49d761f668517f45a673f64da83b333eecc4'
if (zoneTableSha256 !== expectedZoneTableSha256) throw new Error('Pinned IANA zone.tab checksum mismatch')

const backwardLinks = readFileSync(join(ROOT, 'data', 'iana-backward'), 'utf8').replace(/\r\n/g, '\n')
const backwardSha256 = createHash('sha256').update(backwardLinks).digest('hex')
if (backwardSha256 !== 'd2f4c8953f204982ddf4dc0c2debf41b2464de376dad7d546d0fc70f889fa706') {
  throw new Error('Pinned IANA backward checksum mismatch')
}

// Codes present in libphonenumber-js that are exceptionally/user-reserved rather
// than officially assigned ISO 3166-1 alpha-2 country entries:
//   AC (Ascension Island) and TA (Tristan da Cunha) belong to ISO 3166-1 SH.
//   XK is a user-assigned code (not an officially assigned ISO 3166-1 entry).
const EXCLUDED_NON_ISO_3166_1 = new Set(['AC', 'TA', 'XK'])

// ISO 3166-1 territories missing from the pinned phone metadata. Supply a
// prefix only where the cited ITU records affirmatively cover the territory.
const TERRITORY_DIALING_CODES = Object.freeze({
  AQ: [],
  BV: [],
  GS: [],
  HM: [],
  PN: [],
  TF: ['+262'],
  UM: [],
})

function buildRawCountries() {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
  const lpCodes = getCountries().filter((code) => !EXCLUDED_NON_ISO_3166_1.has(code))
  const allCodes = [...new Set([...lpCodes, ...Object.keys(TERRITORY_DIALING_CODES)])]

  const rows = allCodes.map((code) => {
    const name = displayNames.of(code)
    if (!name || name === code) {
      throw new Error(`Missing ICU/CLDR English region name for ISO 3166-1 code: ${code}`)
    }
    let dialingCodes
    if (Object.hasOwn(TERRITORY_DIALING_CODES, code)) {
      dialingCodes = [...TERRITORY_DIALING_CODES[code]]
    } else if (code === 'SH') {
      // ISO 3166-1 SH covers Saint Helena / Tristan da Cunha (+290) and Ascension Island (+247).
      dialingCodes = [`+${getCountryCallingCode('SH')}`, `+${getCountryCallingCode('AC')}`]
    } else {
      dialingCodes = [`+${getCountryCallingCode(code)}`]
    }
    return [code, name, dialingCodes]
  })

  const collator = new Intl.Collator('en')
  rows.sort((left, right) => collator.compare(left[1], right[1]) || (left[0] < right[0] ? -1 : 1))

  if (rows.length !== 249) {
    throw new Error(`Expected 249 ISO 3166-1 alpha-2 countries, generated ${rows.length}`)
  }
  return rows
}

// Modern canonical IANA TZDB identifiers that Unicode CLDR/ICU aliases to
// historical primary keys in `Intl.supportedValuesOf('timeZone')` (e.g.
// `Asia/Kolkata` -> `Asia/Calcutta`, `Europe/Kyiv` -> `Europe/Kiev`).
// Each entry is verified against the runtime's Intl.DateTimeFormat below.
const MODERN_IANA_CANONICAL_ZONES = Object.freeze([
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Catamarca',
  'America/Argentina/Cordoba',
  'America/Argentina/Jujuy',
  'America/Argentina/Mendoza',
  'America/Indiana/Indianapolis',
  'America/Kentucky/Louisville',
  'America/Nuuk',
  'Asia/Ho_Chi_Minh',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Yangon',
  'Atlantic/Faroe',
  'Europe/Kyiv',
  'Pacific/Chuuk',
  'Pacific/Pohnpei',
])

function buildIanaTimezones() {
  const zones = new Set(['UTC'])
  for (const tz of Intl.supportedValuesOf('timeZone')) {
    zones.add(tz)
  }
  for (const tz of MODERN_IANA_CANONICAL_ZONES) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      zones.add(tz)
    } catch {
      // Skip if an older runtime ICU lacks this alias.
    }
  }
  return [...zones].sort()
}

function buildCountryZones(rawCountries) {
  const countries = new Set(rawCountries.map(([code]) => code))
  const zones = Object.create(null)
  for (const line of zoneTable.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const [country, , zone] = line.split('\t')
    if (!countries.has(country) || !zone) throw new Error('Invalid country record in pinned IANA table')
    const list = zones[country] ??= []
    if (list.includes(zone)) throw new Error('Duplicate country timezone in pinned IANA table')
    new Intl.DateTimeFormat('en', { timeZone: zone })
    list.push(zone)
  }
  return Object.fromEntries(Object.entries(zones).sort(([left], [right]) => left < right ? -1 : 1))
}

function renderSource(rawCountries, ianaTimezones) {
  const countryZones = buildCountryZones(rawCountries)
  const timezoneLinks = Object.fromEntries(backwardLinks.split('\n')
    .filter((line) => line.startsWith('Link\t'))
    .map((line) => {
      const [, target, alias] = line.split(/\s+/)
      return [alias.toLowerCase(), target]
    })
    .filter(([alias]) => alias.includes('/')))
  const countryLines = rawCountries
    .map(([code, name, dialingCodes]) => `  [${JSON.stringify(code)}, ${JSON.stringify(name)}, ${JSON.stringify(dialingCodes)}],`)
    .join('\n')
  const tzLines = ianaTimezones.map((tz) => `  ${JSON.stringify(tz)},`).join('\n')
  const meta = {
    countryCount: rawCountries.length,
    timezoneCount: ianaTimezones.length,
    libphonenumberJsVersion: lpPkg.version,
    icuVersion: process.versions.icu || 'unknown',
    tzVersion: process.versions.tz || 'unknown',
    nodeMajor: Number(process.versions.node.split('.')[0]),
    nodeVersion: process.versions.node,
    cldrVersion: process.versions.cldr,
    countryZoneCount: Object.keys(countryZones).length,
    zoneTableSha256,
  }

  return `// AUTO-GENERATED by scripts/regenerate-metadata.mjs — DO NOT EDIT BY HAND.
//
// Upstream data provenance:
// - ISO 3166-1 alpha-2 region names: Unicode CLDR / ICU ${meta.icuVersion} via Intl.DisplayNames('en')
// - Country calling codes: libphonenumber-js ${meta.libphonenumberJsVersion} (MIT; Google libphonenumber Apache-2.0)
// - Canonical IANA timezones: IANA TZDB ${meta.tzVersion} via Intl.supportedValuesOf('timeZone') + 'UTC'
// - Country timezone membership: pinned IANA TZDB ${meta.tzVersion} zone.tab
// - Legacy timezone names: pinned IANA TZDB ${meta.tzVersion} backward
// - Territories without a verified calling code in the reviewed inputs have an empty list.

export interface DatasetProvenance {
  readonly countryCount: number
  readonly timezoneCount: number
  readonly libphonenumberJsVersion: string
  readonly icuVersion: string
  readonly tzVersion: string
  readonly nodeMajor: number
  readonly nodeVersion: string
  readonly cldrVersion: string
  readonly countryZoneCount: number
  readonly zoneTableSha256: string
}

export const DATASET_PROVENANCE: DatasetProvenance = Object.freeze(${JSON.stringify(meta, null, 2)})

export const GENERATED_RAW_COUNTRIES: ReadonlyArray<readonly [string, string, readonly string[]]> = Object.freeze([
${countryLines}
])

export const GENERATED_IANA_TIMEZONES: readonly string[] = Object.freeze([
${tzLines}
])

export const GENERATED_IANA_TIMEZONE_LINKS: Readonly<Record<string, string>> = Object.freeze(${JSON.stringify(timezoneLinks, null, 2)})

export const GENERATED_COUNTRY_ZONES: Readonly<Record<string, readonly string[]>> = Object.freeze({
${Object.entries(countryZones).map(([country, zones]) => `  ${country}: Object.freeze(${JSON.stringify(zones)}),`).join('\n')}
})
`
}

const rawCountries = buildRawCountries()
const ianaTimezones = buildIanaTimezones()
const rendered = renderSource(rawCountries, ianaTimezones)

if (CHECK_ONLY) {
  if (!existsSync(OUTPUT_PATH)) {
    console.error(`FAIL: Generated metadata file is missing: ${OUTPUT_PATH}`)
    process.exit(1)
  }
  const existing = readFileSync(OUTPUT_PATH, 'utf8')
  if (existing !== rendered) {
    console.error('FAIL: src/generated/metadata.ts is out of sync with scripts/regenerate-metadata.mjs.')
    console.error('Run `npm run generate:data` and review the diff.')
    process.exit(1)
  }
  console.log(
    `PASS: src/generated/metadata.ts matches reproducible generator (${rawCountries.length} countries, ${ianaTimezones.length} IANA zones, ICU ${process.versions.icu}, TZ ${process.versions.tz}).`,
  )
} else {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, rendered, 'utf8')
  console.log(
    `Generated src/generated/metadata.ts (${rawCountries.length} countries, ${ianaTimezones.length} IANA zones, libphonenumber-js ${lpPkg.version}, ICU ${process.versions.icu}, TZ ${process.versions.tz}).`,
  )
}
