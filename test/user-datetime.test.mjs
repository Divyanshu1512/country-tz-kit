import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INVALID_DATE_TIME,
  deriveLocaleForCountry,
  formatUserDate,
  formatUserDateTime,
  formatUserTime,
  getCountryDefaultTimezone,
  getCountryTimezoneOptions,
  getTrustedIanaTimeZones,
  isMultiTimezoneCountry,
  isValidIanaTimeZone,
  normalizeLocale,
  resolveCountrySelectionPreferences,
  resolveUserDateTimePreferences,
  timezoneBelongsToCountry,
} from '../dist/user-datetime.js'

const INSTANT = '2026-07-15T06:36:00.000Z'
const FORMAT = Object.freeze({ locale: 'en-GB', hourFormat: '24h' })

function local(value, timeZone) {
  return formatUserDateTime(value, { ...FORMAT, timeZone })
}

test('representative saved IANA zones render the same UTC instant accurately without mutation', () => {
  assert.match(local(INSTANT, 'Asia/Kolkata'), /12:06:00/)
  assert.match(local(INSTANT, 'Asia/Shanghai'), /14:36:00/)
  assert.match(local(INSTANT, 'Asia/Tokyo'), /15:36:00/)
  assert.match(local(INSTANT, 'Europe/Paris'), /08:36:00/)
  assert.match(local(INSTANT, 'America/New_York'), /02:36:00/)
  assert.match(local(INSTANT, 'America/St_Johns'), /04:06:00/)
  assert.equal(INSTANT, '2026-07-15T06:36:00.000Z')
})

test('date rollover, year boundary, and DST spring-forward / fall-back transitions use IANA rules', () => {
  // Date rollover (+05:30 crosses midnight)
  assert.match(local('2026-01-01T20:30:00.000Z', 'Asia/Kolkata'), /2 Jan 2026/)
  assert.match(local('2026-01-01T20:30:00.000Z', 'Asia/Kolkata'), /02:00:00/)

  // Year rollover (2026 -> 2027 in Tokyo, stays 2026 in New York)
  const nye = '2026-12-31T22:30:00.000Z'
  assert.match(local(nye, 'Asia/Tokyo'), /2027/)
  assert.match(local(nye, 'America/New_York'), /2026/)
  assert.equal(nye, '2026-12-31T22:30:00.000Z')

  // Europe/Paris spring forward (2026-03-29 01:00 UTC: CET +1 -> CEST +2)
  assert.match(local('2026-03-29T00:30:00.000Z', 'Europe/Paris'), /01:30:00/)
  assert.match(local('2026-03-29T01:30:00.000Z', 'Europe/Paris'), /03:30:00/)

  // America/New_York spring forward (2026-03-08 07:00 UTC: EST -5 -> EDT -4)
  assert.match(local('2026-03-08T06:30:00.000Z', 'America/New_York'), /01:30:00/)
  assert.match(local('2026-03-08T07:30:00.000Z', 'America/New_York'), /03:30:00/)

  // America/New_York fall back (2026-11-01 06:00 UTC: EDT -4 -> EST -5)
  assert.match(local('2026-11-01T05:30:00.000Z', 'America/New_York'), /01:30:00/)
  assert.match(local('2026-11-01T06:30:00.000Z', 'America/New_York'), /01:30:00/)
})

test('Date instances, epoch milliseconds, formatUserTime, formatUserDate, and 12h/24h formats work cleanly', () => {
  const dateObj = new Date(INSTANT)
  const originalMs = dateObj.getTime()
  assert.equal(formatUserDateTime(dateObj, { ...FORMAT, timeZone: 'Asia/Tokyo' }), local(INSTANT, 'Asia/Tokyo'))
  assert.equal(formatUserDateTime(originalMs, { ...FORMAT, timeZone: 'Asia/Tokyo' }), local(INSTANT, 'Asia/Tokyo'))
  assert.equal(dateObj.getTime(), originalMs)

  assert.match(formatUserTime(INSTANT, { locale: 'en-US', timeZone: 'Asia/Kolkata', hourFormat: '12h' }), /12:06:00\s*PM/i)
  assert.match(formatUserTime(INSTANT, { locale: 'en-GB', timeZone: 'Asia/Kolkata', hourFormat: '24h' }), /12:06:00/)
  assert.match(formatUserDate(INSTANT, { locale: 'en-GB', timeZone: 'Asia/Kolkata' }), /15 Jul 2026/)
  assert.doesNotMatch(formatUserDate(INSTANT, { locale: 'en-GB', timeZone: 'Asia/Kolkata' }), /12:06/)
})

test('invalid timestamps, invalid timezones, and numeric offset strings fail safely', () => {
  assert.equal(formatUserDateTime('not-a-date', FORMAT), INVALID_DATE_TIME)
  assert.equal(formatUserDateTime(NaN, FORMAT), INVALID_DATE_TIME)
  assert.equal(formatUserDateTime(null, FORMAT), INVALID_DATE_TIME)
  assert.equal(formatUserDateTime('', { ...FORMAT, invalidFallback: 'N/A' }), 'N/A')
  assert.match(formatUserDateTime(INSTANT, { ...FORMAT, timeZone: 'not/a-zone' }), /06:36:00/)

  for (const invalidTz of ['+05:30', '-04:00', 'GMT+5:30', 'UTC+1', 'IST', '', 'Invalid/Zone', 'A'.repeat(81)]) {
    assert.equal(isValidIanaTimeZone(invalidTz), false, invalidTz)
  }
  assert.equal(isValidIanaTimeZone('UTC'), true)
  assert.equal(isValidIanaTimeZone('Asia/Kolkata'), true)
})

test('preference resolution precedence is saved zone, allowed browser zone, single-zone default, then UTC', () => {
  assert.equal(
    resolveUserDateTimePreferences({
      profile: { country_code: 'IN', timezone: 'Asia/Tokyo', locale: 'ja-JP' },
      browserTimeZone: 'Asia/Shanghai',
    }).timeZone,
    'Asia/Kolkata',
  )
  assert.equal(
    resolveUserDateTimePreferences({
      profile: { country_code: 'IN' },
      browserTimeZone: 'Asia/Shanghai',
    }).timeZone,
    'Asia/Kolkata',
  )
  assert.equal(
    resolveUserDateTimePreferences({
      profile: { country_code: 'IN' },
      browserTimeZone: '',
    }).timeZone,
    'Asia/Kolkata',
  )
  assert.equal(
    resolveUserDateTimePreferences({ profile: {}, browserTimeZone: '' }).timeZone,
    'UTC',
  )
  // camelCase profile fields work identically
  const camel = resolveUserDateTimePreferences({
    profile: { countryCode: 'GB', timeZone: 'Europe/London', locale: 'en-gb', hourFormat: '24h' },
    browserTimeZone: 'UTC',
  })
  assert.deepEqual(camel, {
    countryCode: 'GB',
    timeZone: 'Europe/London',
    locale: 'en-GB',
    hourFormat: '24h',
  })
})

test('multi-timezone countries never receive an arbitrary capital-city default', () => {
  const multiZoneCountries = ['AU', 'BR', 'CA', 'CL', 'EC', 'ES', 'ID', 'KZ', 'MX', 'MY', 'NZ', 'PT', 'RU', 'US']
  for (const code of multiZoneCountries) {
    assert.equal(isMultiTimezoneCountry(code), true, code)
    assert.equal(getCountryDefaultTimezone(code), '', code)
    assert.ok(getCountryTimezoneOptions(code).length >= 2, code)
  }

  // Mismatched browser timezone is NOT blindly applied to a multi-timezone country
  const unresolved = resolveCountrySelectionPreferences({
    countryCode: 'US',
    browserTimeZone: 'Asia/Kolkata',
  })
  assert.equal(unresolved.timeZone, '')
  assert.equal(unresolved.locale, 'en-US')
  assert.equal(unresolved.requiresTimeZoneSelection, true)

  // Matching browser timezone inside the multi-timezone country IS accepted
  const resolved = resolveCountrySelectionPreferences({
    countryCode: 'US',
    browserTimeZone: 'America/Chicago',
  })
  assert.equal(resolved.timeZone, 'America/Chicago')
  assert.equal(resolved.requiresTimeZoneSelection, false)

  // UserDateTimePreferences also refuses a foreign browser zone for a multi-zone country without saved tz
  const prefs = resolveUserDateTimePreferences({
    profile: { countryCode: 'US' },
    browserTimeZone: 'Asia/Kolkata',
  })
  assert.equal(prefs.timeZone, 'UTC')

  assert.equal(timezoneBelongsToCountry('America/Chicago', 'US'), true)
  assert.equal(timezoneBelongsToCountry('Asia/Kolkata', 'US'), false)
  // Legacy IANA alias equivalence via canonical Intl resolution
  assert.equal(timezoneBelongsToCountry('Asia/Calcutta', 'IN'), true)
})

test('locale helpers and trusted timezone list are deterministic and bounded', () => {
  assert.equal(normalizeLocale('en-gb'), 'en-GB')
  assert.equal(normalizeLocale('<script>'), '')
  assert.equal(deriveLocaleForCountry('India'), 'en-IN')
  assert.equal(deriveLocaleForCountry('Japan'), 'ja-JP')
  assert.equal(deriveLocaleForCountry('UnknownCountry'), '')
  const trusted = getTrustedIanaTimeZones()
  assert.ok(trusted.includes('UTC'))
  assert.ok(trusted.includes('Asia/Kolkata'))
  assert.ok(trusted.includes('America/New_York'))
})
