import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DATASET_PROVENANCE,
  DIALING_OPTIONS,
  IANA_TIMEZONES,
  ISO_COUNTRIES,
  getCountryByCode,
  getDialingOption,
  isKnownIanaTimeZone,
  normalizeCallingCode,
  normalizeCountryValue,
  resolveCountryCode,
  resolveDialingSelection,
} from '../dist/country-metadata.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('bundled metadata contains all 249 ISO 3166-1 countries sorted alphabetically and offline', () => {
  assert.equal(ISO_COUNTRIES.length, 249)
  assert.equal(DATASET_PROVENANCE.countryCount, 249)
  assert.equal(new Set(ISO_COUNTRIES.map((c) => c.code)).size, 249)
  assert.equal(new Set(ISO_COUNTRIES.map((c) => c.name)).size, 249)

  const collator = new Intl.Collator('en')
  const sortedNames = ISO_COUNTRIES.map((c) => c.name).sort(collator.compare)
  assert.deepEqual(ISO_COUNTRIES.map((c) => c.name), sortedNames)

  const compiled = readFileSync(join(ROOT, 'dist', 'country-metadata.js'), 'utf8')
  assert.doesNotMatch(compiled, /fetch\s*\(|axios|XMLHttpRequest|https?:\/\//)
  assert.doesNotMatch(compiled, /libphonenumber-js/)
})

test('every ISO country resolves by alpha-2 code (case-insensitive) and display name', () => {
  for (const country of ISO_COUNTRIES) {
    assert.equal(resolveCountryCode(country.code.toLowerCase()), country.code)
    assert.equal(resolveCountryCode(country.code), country.code)
    assert.equal(resolveCountryCode(country.name), country.code)
    assert.equal(getCountryByCode(country.code)?.code, country.code)
  }
  assert.deepEqual(getCountryByCode('AQ')?.dialingCodes, [])
  assert.deepEqual(getCountryByCode('HM')?.dialingCodes, [])
})

test('representative countries and shared/multi calling codes are preserved accurately', () => {
  const expected = {
    IN: ['India', '+91'],
    US: ['United States', '+1'],
    GB: ['United Kingdom', '+44'],
    JP: ['Japan', '+81'],
    BR: ['Brazil', '+55'],
    ZA: ['South Africa', '+27'],
    NZ: ['New Zealand', '+64'],
    AE: ['United Arab Emirates', '+971'],
  }
  for (const [code, [name, callingCode]] of Object.entries(expected)) {
    const country = getCountryByCode(code)
    assert.equal(country?.name, name, code)
    assert.equal(country?.callingCode, callingCode, code)
    assert.ok(
      DIALING_OPTIONS.some(
        (option) =>
          option.countryCode === code &&
          option.callingCode === callingCode &&
          option.label === `${callingCode} ${name}`,
      ),
      code,
    )
  }

  assert.equal(DIALING_OPTIONS.length, 244)
  assert.equal(new Set(DIALING_OPTIONS.map((o) => o.id)).size, 244)
  for (const code of ['AQ', 'BV', 'GS', 'HM', 'PN', 'UM']) {
    assert.deepEqual(getCountryByCode(code)?.dialingCodes, [], code)
  }
  assert.deepEqual(getCountryByCode('TF')?.dialingCodes, ['+262'])
  assert.ok(DIALING_OPTIONS.filter((o) => o.callingCode === '+1').length > 20)
  assert.ok(DIALING_OPTIONS.some((o) => o.id === 'US:+1'))
  assert.ok(DIALING_OPTIONS.some((o) => o.id === 'CA:+1'))
  assert.ok(DIALING_OPTIONS.some((o) => o.id === 'BS:+1'))
  assert.ok(DIALING_OPTIONS.some((o) => o.id === 'SH:+247' && o.label === '+247 Ascension Island'))
  assert.ok(
    DIALING_OPTIONS.some(
      (o) => o.id === 'SH:+290' && o.label === '+290 Saint Helena and Tristan da Cunha',
    ),
  )
  assert.deepEqual(getCountryByCode('SH')?.dialingCodes, ['+290', '+247'])
})

test('recognized legacy names, diacritic variants, and CLDR alternates resolve canonically', () => {
  for (const [alias, expected] of [
    [' UK ', 'GB'],
    ['United States of America', 'US'],
    ['U.S.', 'US'],
    ['U.S.A.', 'US'],
    ['UAE', 'AE'],
    ['Czech Republic', 'CZ'],
    ['Cote d\u2019Ivoire', 'CI'],
    ['Iran (Islamic Republic of)', 'IR'],
    ['Viet Nam', 'VN'],
    ['Swaziland', 'SZ'],
    ['Lao People\u2019s Democratic Republic', 'LA'],
    ['Sao Tome & Principe', 'ST'],
    ['Hong Kong', 'HK'],
    ['Macau', 'MO'],
    ['Saint Lucia', 'LC'],
    ['Saint Helena', 'SH'],
    ['Turkey', 'TR'],
    ['Turkiye', 'TR'],
    ['DR Congo', 'CD'],
    ['Myanmar', 'MM'],
  ]) {
    assert.equal(resolveCountryCode(alias), expected, alias)
  }

  assert.equal(normalizeCountryValue('India'), 'IN')
  assert.equal(normalizeCountryValue('GB'), 'GB')
  assert.equal(normalizeCountryValue('Legacy Saved Country'), 'Legacy Saved Country')
  assert.equal(normalizeCountryValue('', 'US'), 'US')
  assert.equal(normalizeCountryValue(''), '')
})

test('dialing selection preserves country disambiguation for shared calling codes', () => {
  assert.equal(resolveDialingSelection({ countryValue: 'Canada', callingCode: '+1' }), 'CA:+1')
  assert.equal(
    resolveDialingSelection({ countryValue: 'United States', callingCode: '+1' }),
    'US:+1',
  )
  assert.equal(
    resolveDialingSelection({ countryValue: 'United Kingdom', callingCode: '+44' }),
    'GB:+44',
  )
  assert.equal(resolveDialingSelection({ callingCode: '+81' }), 'JP:+81')
  assert.equal(resolveDialingSelection({ fallbackCountryCode: 'DE' }), 'DE:+49')
  assert.equal(resolveDialingSelection({}), '')
})

test('unsafe, malformed, or non-string lookup inputs fail closed', () => {
  for (const bad of [
    'Atlantis',
    'Other',
    'India!',
    '<India>',
    'India()',
    'IN...',
    'I\u200bN',
    'India\u0000',
    'India\n',
    '\u0131n',
    'India'.repeat(40),
    91,
    ['IN'],
    { toString: () => 'India' },
    null,
    undefined,
  ]) {
    assert.equal(resolveCountryCode(bad), null)
  }

  assert.equal(normalizeCallingCode('91'), '+91')
  assert.equal(normalizeCallingCode(' +44 '), '+44')
  for (const badCode of [
    'abc91',
    '+9x1',
    '+091',
    '+999',
    '+91\n',
    '91<script>',
    91,
    ['91'],
    '+'.repeat(20),
  ]) {
    assert.equal(normalizeCallingCode(badCode), null)
  }

  assert.equal(getDialingOption('US:+1')?.countryCode, 'US')
  assert.equal(getDialingOption('SH:+247')?.callingCode, '+247')
  assert.equal(getDialingOption('US:+1\n'), null)
  for (const option of DIALING_OPTIONS) {
    assert.equal(normalizeCallingCode(option.callingCode), option.callingCode)
  }
})

test('bundled IANA timezone catalog contains UTC, major canonical zones, and modern IANA aliases', () => {
  assert.ok(IANA_TIMEZONES.length >= 400)
  assert.ok(IANA_TIMEZONES.includes('UTC'))
  for (const zone of [
    'UTC',
    'Asia/Kolkata',
    'Asia/Ho_Chi_Minh',
    'Asia/Kathmandu',
    'Asia/Yangon',
    'Europe/Kyiv',
    'America/New_York',
    'America/Argentina/Buenos_Aires',
    'Europe/London',
  ]) {
    assert.ok(IANA_TIMEZONES.includes(zone), `Expected ${zone} in IANA_TIMEZONES`)
    assert.equal(isKnownIanaTimeZone(zone), true, zone)
  }
  assert.equal(isKnownIanaTimeZone('Invalid/Zone'), false)
  assert.equal(isKnownIanaTimeZone('+05:30'), false)
  assert.equal(isKnownIanaTimeZone('Asia/Kolkata\n'), false)
})
