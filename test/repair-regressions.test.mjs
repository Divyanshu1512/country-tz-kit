import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DATASET_PROVENANCE, IANA_TIMEZONES, ISO_COUNTRIES, getCountryDefaultTimezone,
  getCountryTimezoneOptions, getTrustedIanaTimeZones, isMultiTimezoneCountry, isValidIanaTimeZone,
  normalizeCountryValue, resolveCountrySelectionPreferences, resolveDialingSelection,
  resolveDialingSelectionResult, resolveUserDateTimePreferences, timezoneBelongsToCountry,
} from '../dist/index.js'
import { hasUnsafeUnicodeOrMarkup, validateDisplayPreferences, validateSafeText } from '../dist/validation.js'
import { scanReleaseText } from '../scripts/audit-release.mjs'

test('every pinned country zone is represented, including optional runtime aliases', () => {
  const lines = readFileSync(new URL('../data/iana-zone.tab', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((line) => /^[A-Z]{2}\t/.test(line))
  const mapped = new Map()
  for (const line of lines) {
    const [country, , zone] = line.split('\t')
    if (!mapped.has(country)) mapped.set(country, [])
    mapped.get(country).push(zone)
  }
  assert.equal(mapped.size, 247)
  assert.equal(DATASET_PROVENANCE.countryZoneCount, 247)
  assert.equal(IANA_TIMEZONES.length, 435)
  for (const { code } of ISO_COUNTRIES) {
    const zones = mapped.get(code) ?? []
    assert.deepEqual(getCountryTimezoneOptions(code), zones.filter(isValidIanaTimeZone), code)
    assert.equal(isMultiTimezoneCountry(code), zones.length > 1, code)
    assert.equal(getCountryDefaultTimezone(code), zones.length === 1 && isValidIanaTimeZone(zones[0]) ? zones[0] : '', code)
  }
})

test('country changes preserve valid selections and disallow foreign defaults', () => {
  assert.equal(resolveCountrySelectionPreferences({ countryCode: 'CN', browserTimeZone: 'Asia/Urumqi' }).timeZone, 'Asia/Urumqi')
  const unresolved = resolveCountrySelectionPreferences({
    countryCode: 'CN', currentTimeZone: 'Asia/Tokyo', browserTimeZone: 'America/Toronto',
  })
  assert.equal(unresolved.timeZone, '')
  assert.equal(unresolved.requiresTimeZoneSelection, true)
  assert.equal(timezoneBelongsToCountry('Asia/Calcutta', 'IN'), true)
  assert.equal(timezoneBelongsToCountry('America/Punta_Arenas', 'CL'), true)
  assert.equal(getCountryTimezoneOptions('CL').includes('America/Coyhaique'), isValidIanaTimeZone('America/Coyhaique'))
  assert.equal(resolveUserDateTimePreferences({
    profile: { countryCode: 'CN', timeZone: 'Asia/Urumqi' }, browserTimeZone: 'Asia/Shanghai',
  }).timeZone, 'Asia/Urumqi')
  assert.equal(validateDisplayPreferences({ country: 'US', timezone: 'Asia/Tokyo' }).valid, false)
  assert.equal(validateDisplayPreferences({ country: 'US', timezone: 'America/Chicago' }).valid, true)
  for (const { code } of ISO_COUNTRIES.filter(({ code }) => !getCountryTimezoneOptions(code).length)) {
    assert.equal(resolveCountrySelectionPreferences({ countryCode: code, browserTimeZone: 'Asia/Tokyo' })
      .requiresTimeZoneSelection, true)
  }
})

test('every offered timezone passes display preference validation', () => {
  for (const timezone of getTrustedIanaTimeZones()) {
    assert.equal(validateDisplayPreferences({ timezone }).valid, true, timezone)
  }
  for (const timezone of [
    'America/Montreal', 'America/Nipigon', 'America/Pangnirtung', 'America/Rainy_River',
    'America/Santa_Isabel', 'America/Thunder_Bay', 'America/Yellowknife', 'Asia/Choibalsan',
    'Australia/Currie', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Pacific/Johnston',
  ]) {
    assert.equal(validateDisplayPreferences({ timezone }).valid, isValidIanaTimeZone(timezone), timezone)
  }
})

test('legacy runtime aliases preserve a saved timezone within its country', () => {
  for (const [timezone, country] of [
    ['America/Montreal', 'CA'], ['Asia/Choibalsan', 'MN'], ['Europe/Uzhgorod', 'UA'],
  ]) {
    assert.equal(validateDisplayPreferences({ timezone, country }).valid, true, timezone)
    assert.equal(validateDisplayPreferences({ timezone, country: 'JP' }).valid, false, timezone)
    assert.equal(resolveCountrySelectionPreferences({
      countryCode: country, currentTimeZone: timezone, browserTimeZone: '',
    }).timeZone, timezone)
  }
})

test('a legacy alias cannot transfer an active country-table zone to a different country', () => {
  for (const [timezone, current, country, foreignCountry] of [
    ['America/Coral_Harbour', 'America/Atikokan', 'CA', 'PA'],
    ['Africa/Asmera', 'Africa/Asmara', 'ER', 'KE'],
    ['Pacific/Truk', 'Pacific/Chuuk', 'FM', 'PG'],
    ['Pacific/Ponape', 'Pacific/Pohnpei', 'FM', 'SB'],
    ['Atlantic/Jan_Mayen', 'Arctic/Longyearbyen', 'SJ', 'DE'],
    ['America/Virgin', 'America/St_Thomas', 'VI', 'PR'],
  ]) {
    assert.equal(timezoneBelongsToCountry(current, country), true, current)
    assert.equal(validateDisplayPreferences({ timezone, country }).valid, true, timezone)
    assert.equal(validateDisplayPreferences({ timezone, country: foreignCountry }).valid, false, timezone)
    assert.equal(resolveCountrySelectionPreferences({
      countryCode: foreignCountry, currentTimeZone: timezone, browserTimeZone: '',
    }).timeZone, getCountryDefaultTimezone(foreignCountry), timezone)
  }
  const canonical = (timeZone) => new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone
  const southPole = 'Antarctica/South_Pole'
  assert.equal(timezoneBelongsToCountry(southPole, 'NZ'), getCountryTimezoneOptions('NZ').some(
    (zone) => canonical(zone) === canonical(southPole),
  ))
})

test('shared calling codes preserve the country and require an explicit disambiguation', () => {
  for (const [countryValue, callingCode, id] of [
    ['CA', '+1', 'CA:+1'], ['US', '+1', 'US:+1'], ['GB', '+44', 'GB:+44'],
    ['GG', '+44', 'GG:+44'], ['SH', '+247', 'SH:+247'], ['SH', '+290', 'SH:+290'],
  ]) assert.deepEqual(resolveDialingSelectionResult({ countryValue, callingCode }), { status: 'selected', id })
  for (const input of [{ callingCode: '+1' }, { callingCode: '+44' }, { countryValue: 'SH' }]) {
    assert.deepEqual(resolveDialingSelectionResult(input), { status: 'ambiguous', id: '' })
  }
  assert.deepEqual(resolveDialingSelectionResult({ countryValue: 'US', callingCode: '+44', fallbackCountryCode: 'GB' }),
    { status: 'conflict', id: '' })
  assert.equal(resolveDialingSelection({ countryValue: 'US', callingCode: '+44' }), '')
  assert.equal(resolveDialingSelectionResult({ countryValue: 'US', callingCode: 'x' }).status, 'invalid')
})

test('absolute timestamps have identical results under UTC, India and US host zones', () => {
  const script = [
    "import { formatUserDateTime, formatUserTime } from './dist/index.js'",
    "const opts = { timeZone: 'UTC', locale: 'en-GB', hourFormat: '24h' }",
    "const local = { ...opts, timeZone: 'America/New_York' }",
    "const values = ['2026-07-15T06:36:00Z', '2026-07-15T12:06:00+05:30', '2026-07-15T06:36:00', '2026-02-30T12:00:00Z', '2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00']",
    "console.log(JSON.stringify(values.map(x=>formatUserDateTime(x,opts)).concat([formatUserTime('2026-03-08T07:00:00Z',local)])))",
  ].join('\n')
  const results = ['UTC', 'Asia/Kolkata', 'America/New_York'].map((TZ) => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, TZ }, encoding: 'utf8',
    })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  })
  assert.deepEqual(results[0], results[1])
  assert.deepEqual(results[0], results[2])
  assert.equal(results[0][0], results[0][1])
  assert.deepEqual(results[0].slice(2, 4), ['—', '—'])
  assert.notEqual(results[0][4], results[0][5])
  assert.equal(results[0][6], '03:00:00')
})

test('untrusted text is bounded even when consumers supply a large max', () => {
  const long = 'A'.repeat(100_000)
  assert.equal(hasUnsafeUnicodeOrMarkup(long), true)
  assert.deepEqual(validateSafeText(long, { max: 100_000 }), { valid: false, text: '' })
  assert.deepEqual(validateSafeText('x', { max: Infinity }), { valid: false, text: '' })
  assert.equal(normalizeCountryValue(long), '')
  assert.equal(isValidIanaTimeZone('\u202eAsia/Tokyo'), false)
})

test('release audit measures its own script and normalized synthetic indicators', () => {
  const marker = ['synthetic', 'review', 'indicator'].join('-')
  const patterns = [marker, Buffer.from(marker).toString('base64'), Array.from(marker)
    .map((character) => '\\x' + character.charCodeAt(0).toString(16)).join(''),
  ]
  for (const value of patterns) assert.deepEqual(scanReleaseText(value, [marker]), ['private-inventory'])
  const script = readFileSync(new URL('../scripts/audit-release.mjs', import.meta.url), 'utf8')
  assert.ok(scanReleaseText(script, ['function audit(']).includes('private-inventory'))
})

test('the pinned generator passes only on the exact dataset toolchain', () => {
  const result = spawnSync(process.execPath, ['scripts/regenerate-metadata.mjs', '--check'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
  })
  const pinned = process.versions.node === '24.15.0' && process.versions.icu === '78.2' &&
    process.versions.cldr === '48.0' && process.versions.tz === '2026a'
  if (pinned) assert.equal(result.status, 0, result.stderr)
  else {
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Metadata generation requires Node 24\.15\.0/)
  }
})
