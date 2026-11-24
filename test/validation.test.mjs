import assert from 'node:assert/strict'
import test from 'node:test'

import {
  VALIDATION_ERROR_CODES,
  hasUnsafeUnicodeOrMarkup,
  validateAddress,
  validateCity,
  validateContactFields,
  validateDisplayPreferences,
  validateOptionalText,
  validatePersonName,
  validateSafeText,
} from '../dist/validation.js'

const VALID_CONTACT = Object.freeze({
  fullName: 'Aarav Sharma',
  countryCode: 'IN',
  city: 'Bengaluru',
  addressLine1: '42 Residency Road',
  addressLine2: 'Suite 7',
  stateRegion: 'Karnataka',
  postalCode: '560001',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  hourFormat: '24h',
})

for (const [label, fullName] of [
  ['multi-part Latin', 'Aarav Sharma'],
  ['single-part Latin', 'Pranav'],
  ['accented apostrophe', 'L\u00e9a O\u2019Brien'],
  ['Devanagari', '\u0905\u092e\u093f\u0924 \u0936\u0930\u094d\u092e\u093e'],
  ['Arabic', '\u0645\u062d\u0645\u062f \u0639\u0644\u064a'],
  ['Cyrillic', '\u0410\u043d\u043d\u0430 \u041f\u0435\u0442\u0440\u043e\u0432\u0430'],
  ['single Han character', '\u738b'],
  ['single Hangul syllable', '\uac15'],
  ['Indic script ZWJ', '\u0915\u094d\u200d\u0937'],
  ['Indic script ZWNJ', '\u0d28\u0d4d\u200c\u0d28'],
  ['Japanese middle dot', '\u30a2\u30f3\u30ca\u30fb\u30de\u30ea\u30a2'],
  ['initials and hyphen', 'R. Anne-Marie, Jr.'],
  ['supplementary Unicode letters', '\u{10400}\u{10401}'],
]) {
  test(`validatePersonName accepts ${label}`, () => {
    const res = validatePersonName(fullName)
    assert.equal(res.valid, true)
    assert.ok(res.text.length > 0)
  })
}

for (const [label, fullName] of [
  ['empty', ''],
  ['whitespace only', '   \u00a0 '],
  ['punctuation only', "---.'"],
  ['digits only', '123456'],
  ['mixed digits', 'Aarav123'],
  ['single Latin initial', 'A'],
  ['overlong (161 chars)', 'A'.repeat(161)],
  ['HTML script tag', '<script>alert(1)</script>'],
  ['dangling ZWJ', 'Aarav\u200d'],
  ['leading ZWNJ', '\u200cAarav'],
  ['combining marks only', '\u0301\u0301'],
  ['emoji', '\u{1f600}\u{1f600}'],
]) {
  test(`validatePersonName rejects ${label}`, () => {
    assert.equal(validatePersonName(fullName).valid, false)
  })
}

test('validateSafeText collapses Unicode spaces and normalizes combining accents to NFC', () => {
  const res = validatePersonName('  Jose\u0301\u00a0   Test  ')
  assert.equal(res.valid, true)
  assert.equal(res.text, 'Jos\u00e9 Test')
  assert.equal(validatePersonName('A'.repeat(160)).valid, true)
})

for (const [label, city] of [
  ['ASCII', 'Bengaluru'],
  ['Unicode Latin', 'S\u00e3o Paulo'],
  ['Devanagari', '\u092e\u0941\u0902\u092c\u0908'],
  ['Han', '\u5317\u4eac'],
  ['apostrophe', "St. John's"],
  ['numbered district', 'Sector 62'],
  ['parentheses', 'Frankfurt (Oder)'],
]) {
  test(`validateCity accepts ${label}`, () => {
    assert.equal(validateCity(city).valid, true)
  })
}

test('validateCity enforces bounds and rejects markup/noise', () => {
  assert.equal(validateCity('  Fictional\u00a0   Exampleton  ').text, 'Fictional Exampleton')
  assert.equal(validateCity('Ab').valid, true)
  assert.equal(validateCity('A'.repeat(160)).valid, true)
  for (const bad of ['', '   ', '---.', '123456', 'A', 'A'.repeat(161), '<script>city</script>', 'City!!!']) {
    assert.equal(validateCity(bad).valid, false)
  }
})

test('validateAddress accepts international addresses and preserves punctuation without destructive stripping', () => {
  for (const addr of ['12 Residency Road', '42 Fictional Lane, #7 / Block B', '\u6771\u4eac\u90fd 123-4-5']) {
    assert.equal(validateAddress(addr).valid, true)
  }
  const sqlLike = "42 Example St'); DROP TABLE contacts; --"
  const res = validateAddress(sqlLike)
  assert.equal(res.valid, true)
  assert.equal(res.text, sqlLike)

  for (const bad of ['', '   ', 'Road', '-----...', '123456789', 'A.....', 'A'.repeat(241), '<img src=x>', null]) {
    assert.equal(validateAddress(bad).valid, false)
  }
})

test('validateOptionalText allows null/empty and validates bounded optional fields', () => {
  for (const empty of [undefined, null, '', '   ']) {
    assert.equal(validateOptionalText(empty, { max: 32 }).valid, true)
  }
  assert.equal(validateOptionalText('560001', { max: 32 }).valid, true)
  assert.equal(validateOptionalText('7', { max: 240 }).valid, true)
  assert.equal(validateOptionalText('----', { max: 32 }).valid, false)
  assert.equal(validateOptionalText('12345', { max: 160, requireLetter: true }).valid, false)
  assert.equal(validateOptionalText('A'.repeat(33), { max: 32 }).valid, false)
})

test('all 17 control, bidi, separator, surrogate, and tag characters are rejected before trimming', () => {
  const controls = [
    ['null byte', '\0'],
    ['line feed', '\n'],
    ['carriage return', '\r'],
    ['tab', '\t'],
    ['DEL', '\u007f'],
    ['C1 control', '\u0085'],
    ['soft hyphen', '\u00ad'],
    ['Arabic letter mark', '\u061c'],
    ['zero-width space', '\u200b'],
    ['bidi override', '\u202e'],
    ['bidi isolate', '\u2066'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
    ['word joiner', '\u2060'],
    ['BOM', '\ufeff'],
    ['lone surrogate', '\ud800'],
    ['Unicode tag', '\u{e0001}'],
  ]
  for (const [label, ch] of controls) {
    assert.equal(hasUnsafeUnicodeOrMarkup(`valid${ch}`), true, label)
    assert.equal(validateSafeText(`valid${ch}`).valid, false, label)
    const res = validateContactFields({ ...VALID_CONTACT, fullName: `Aarav${ch}` })
    assert.equal(res.valid, false, label)
    assert.equal(res.errors.fullName, VALIDATION_ERROR_CODES.INVALID_FULL_NAME, label)
  }
})

test('huge payloads are rejected before normalization and never echoed into errors', () => {
  const huge = 'X'.repeat(1_000_000)
  for (const field of ['fullName', 'city', 'addressLine1', 'addressLine2', 'stateRegion', 'postalCode', 'timezone', 'locale', 'hourFormat']) {
    const res = validateContactFields({ ...VALID_CONTACT, [field]: huge })
    assert.equal(res.valid, false, field)
    assert.ok(JSON.stringify(res.errors).length < 500)
    assert.ok(JSON.stringify(res.normalized).length < 1000)
  }
})

test('validateDisplayPreferences enforces canonical IANA timezones, BCP 47 locales, hourFormat, and country match', () => {
  const ok = validateDisplayPreferences({
    timezone: ' Europe/London ',
    locale: 'en-gb',
    hourFormat: '12h',
    country: 'United Kingdom',
    countryCode: 'GB',
  })
  assert.equal(ok.valid, true)
  assert.deepEqual(ok.normalized, {
    timezone: 'Europe/London',
    locale: 'en-GB',
    hourFormat: '12h',
    countryCode: 'GB',
  })

  const nullable = validateDisplayPreferences({ timezone: null, locale: null, hourFormat: null })
  assert.equal(nullable.valid, true)
  assert.deepEqual(nullable.normalized, { timezone: null, locale: null, hourFormat: null })

  const bad = validateDisplayPreferences({
    timezone: 'Invalid/Zone',
    locale: 'bad_locale',
    hourFormat: '25h',
    country: 'India',
    countryCode: 'US',
  })
  assert.equal(bad.valid, false)
  assert.equal(bad.errors.timezone, VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE)
  assert.equal(bad.errors.locale, VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE)
  assert.equal(bad.errors.hourFormat, VALIDATION_ERROR_CODES.INVALID_DISPLAY_PREFERENCE)
  assert.equal(bad.errors.country, VALIDATION_ERROR_CODES.INVALID_COUNTRY)
})

test('validateContactFields does not mutate input, handles non-objects cleanly, and freezes outputs', () => {
  const input = { ...VALID_CONTACT, fullName: '  Aarav Sharma  ' }
  const snapshot = structuredClone(input)
  const res = validateContactFields(input)
  assert.equal(res.valid, true)
  assert.equal(res.normalized.fullName, 'Aarav Sharma')
  assert.deepEqual(input, snapshot)
  assert.equal(Object.isFrozen(res), true)
  assert.equal(Object.isFrozen(res.errors), true)
  assert.equal(Object.isFrozen(res.normalized), true)

  for (const invalid of [null, undefined, false, [], 'text', 42]) {
    const r = validateContactFields(invalid)
    assert.equal(r.valid, false)
    assert.equal(Object.hasOwn(r, 'stack'), false)
  }
})
