/**
 * Synthetic React signup-form & localized timestamp example.
 * Uses fictional data only; no backend or authentication dependencies.
 */

import { useState } from 'react'
import {
  DIALING_OPTIONS,
  ISO_COUNTRIES,
  getCountryTimezoneOptions,
  resolveDialingSelection,
} from '../src/index.js'
import { UserDateTimeProvider, useCountrySelection, useUserDateTime } from '../src/react.js'

const SYNTHETIC_AUDIT_TIMESTAMP = '2026-07-15T06:36:00.000Z'

function LocalizedTimestampBanner() {
  const { preferences, formatDateTime } = useUserDateTime()
  return (
    <p>
      Display zone: <strong>{preferences.timeZone}</strong> ({preferences.locale}) — Sample event:{' '}
      <time dateTime={SYNTHETIC_AUDIT_TIMESTAMP}>{formatDateTime(SYNTHETIC_AUDIT_TIMESTAMP)}</time>
    </p>
  )
}

export function SyntheticLocaleFormExample() {
  const [countryCode, setCountryCode] = useState('US')
  const [timeZone, setTimeZone] = useState('')
  const [dialingId, setDialingId] = useState(() =>
    resolveDialingSelection({ countryValue: 'US', callingCode: '+1' }),
  )

  const selection = useCountrySelection({
    countryCode,
    currentTimeZone: timeZone,
    browserTimeZone: 'UTC',
  })

  const countryZones = getCountryTimezoneOptions(countryCode)

  return (
    <UserDateTimeProvider
      profile={{
        countryCode,
        timeZone: timeZone || selection.timeZone,
        locale: selection.locale,
        hourFormat: '24h',
      }}
      browserTimeZone="UTC"
    >
      <section aria-label="Synthetic locale preferences">
        <label>
          Country
          <select
            value={countryCode}
            onChange={(event) => {
              const nextCountry = event.target.value
              setCountryCode(nextCountry)
              setTimeZone('')
              setDialingId(resolveDialingSelection({ countryValue: nextCountry }))
            }}
          >
            {ISO_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Timezone
          <select value={timeZone || selection.timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {selection.requiresTimeZoneSelection && (
              <option value="">Select your local timezone (multiple zones in country)</option>
            )}
            {countryZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>

        <label>
          Dialing code
          <select value={dialingId} onChange={(e) => setDialingId(e.target.value)}>
            {DIALING_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <LocalizedTimestampBanner />
      </section>
    </UserDateTimeProvider>
  )
}
