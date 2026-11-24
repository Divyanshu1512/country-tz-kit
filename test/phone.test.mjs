import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeInternationalPhone,
  validateInternationalPhone,
} from '../dist/phone.js'

for (const [label, raw, code, expected] of [
  ['Indian national', '9876501234', '+91', '+919876501234'],
  ['Indian trunk prefix', '09876501234', '+91', '+919876501234'],
  ['Indian international', '+91 98765 01234', '+91', '+919876501234'],
  ['Indian 00 access prefix', '0091 98765 01234', '+91', '+919876501234'],
  ['Indian national starting with calling digits', '9176501234', '+91', '+919176501234'],
  ['UK trunk prefix', '020 7946 0018', '+44', '+442079460018'],
  ['UK significant national', '2079460018', '+44', '+442079460018'],
  ['UK E.164 formatted', '+44 (20) 7946-0018', '+44', '+442079460018'],
  ['US national', '(212) 555-0100', '+1', '+12125550100'],
  ['French trunk prefix', '01 45 45 32 45', '+33', '+33145453245'],
  ['German trunk prefix', '030 123456', '+49', '+4930123456'],
  ['Italian significant leading zero', '06 12345678', '+39', '+390612345678'],
  ['Unicode phone spaces', '020\u00a07946\u202f0018', '+44', '+442079460018'],
]) {
  test(`phone parser normalizes and validates ${label}`, () => {
    assert.equal(normalizeInternationalPhone(raw, code), expected)
    assert.equal(validateInternationalPhone(raw, code), expected)
  })
}

for (const [label, phone, code] of [
  ['empty', '', '+91'],
  ['alphabetic prefix', 'phone9876501234', '+91'],
  ['embedded letters', '98765abc01234', '+91'],
  ['too short', '12', '+91'],
  ['too long', '9876501234567890123', '+91'],
  ['extension', '+919876501234 ext 4', '+91'],
  ['duplicate plus', '++919876501234', '+91'],
  ['internal plus', '98+76501234', '+91'],
  ['invalid Indian mobile structure', '3123456789', '+91'],
  ['uniform repeated digits (9s)', '9999999999', '+91'],
  ['uniform repeated digits (6s)', '6666666666', '+91'],
  ['mismatched country calling code', '+442079460018', '+91'],
  ['00 foreign prefix mismatch', '0044 20 7946 0018', '+91'],
  ['unknown calling code', '9876501234', '+999'],
  ['leading-zero calling code', '9876501234', '+091'],
  ['bare calling code without plus', '9876501234', '91'],
  ['alphabetic calling code', '9876501234', 'abc+91'],
  ['HTML markup', '+91<9876501234>', '+91'],
  ['number-typed input', 9876501234, '+91'],
  ['control character', '9876501234\n', '+91'],
  ['huge string', '9'.repeat(1000), '+91'],
]) {
  test(`validateInternationalPhone rejects ${label}`, () => {
    assert.equal(validateInternationalPhone(phone, code), null)
  })
}

test('normalizeInternationalPhone formats 00-prefix international numbers without claiming selector match', () => {
  assert.equal(normalizeInternationalPhone('0044 20 7946 0018', '+91'), '+442079460018')
  assert.equal(validateInternationalPhone('0044 20 7946 0018', '+91'), null)
  assert.equal(normalizeInternationalPhone('abc9876501234', '+91'), '')
  assert.equal(normalizeInternationalPhone('9876501234', 'abc91'), '')
})
