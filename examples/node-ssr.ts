/**
 * Synthetic Node.js / SSR example using country-tz-kit.
 * All names, addresses, phone numbers, and timestamps below are fictional.
 */

import {
  formatUserDateTime,
  resolveCountrySelectionPreferences,
  resolveDialingSelection,
  resolveUserDateTimePreferences,
} from '../src/index.js'
import { validateInternationalPhone } from '../src/phone.js'
import { validateContactFields } from '../src/validation.js'

const syntheticEventUtc = '2026-07-15T06:36:00.000Z'

// 1. Multi-timezone country safeguard: selecting US while browser is in Asia/Kolkata
// never guesses America/New_York; it requires explicit user selection.
const usSelection = resolveCountrySelectionPreferences({
  countryCode: 'United States',
  browserTimeZone: 'Asia/Kolkata',
})

// 2. Single-timezone country resolves unambiguously.
const jpSelection = resolveCountrySelectionPreferences({
  countryCode: 'Japan',
  browserTimeZone: '',
})

// 3. Disambiguate shared +1 dialing code between Canada and the United States.
const caDialingId = resolveDialingSelection({ countryValue: 'Canada', callingCode: '+1' })

// 4. Validate synthetic international contact form fields & E.164 phone.
const contact = validateContactFields({
  fullName: 'Aarav Patel',
  country: 'India',
  city: 'Exampleton',
  addressLine1: '42 Fictional Avenue',
  addressLine2: 'Suite 3',
  stateRegion: 'Example State',
  postalCode: '560001',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  hourFormat: '24h',
})

const e164Phone = validateInternationalPhone('(212) 555-0100', '+1')

// 5. Render the same UTC instant for two different user preference sets.
const userPrefs = resolveUserDateTimePreferences({
  profile: {
    countryCode: contact.normalized.countryCode,
    timeZone: contact.normalized.timezone,
    locale: contact.normalized.locale,
    hourFormat: contact.normalized.hourFormat,
  },
  browserTimeZone: 'UTC',
})

export const syntheticDemoOutput = {
  usSelection,
  jpSelection,
  caDialingId,
  contactValid: contact.valid,
  e164Phone,
  formattedLocal: formatUserDateTime(syntheticEventUtc, userPrefs),
  formattedUtc: formatUserDateTime(syntheticEventUtc, { timeZone: 'UTC', locale: 'en-GB', hourFormat: '24h' }),
}
