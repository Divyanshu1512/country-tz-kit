import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  UserDateTimeProvider,
  useCountrySelection,
  useUserDateTime,
} from '../dist/react.js'

const INSTANT = '2026-07-15T06:36:00.000Z'

function TimestampProbe({ instant }) {
  const { preferences, formatDateTime, formatTime, formatDate } = useUserDateTime()
  return React.createElement(
    'dl',
    null,
    React.createElement('dd', { 'data-field': 'tz' }, preferences.timeZone),
    React.createElement('dd', { 'data-field': 'locale' }, preferences.locale),
    React.createElement('dd', { 'data-field': 'dt' }, formatDateTime(instant)),
    React.createElement('dd', { 'data-field': 'time' }, formatTime(instant)),
    React.createElement('dd', { 'data-field': 'date' }, formatDate(instant)),
  )
}

function CountrySelectionProbe({ countryCode, currentTimeZone, browserTimeZone }) {
  const selection = useCountrySelection({ countryCode, currentTimeZone, browserTimeZone })
  return React.createElement(
    'div',
    {
      'data-country': selection.countryCode,
      'data-tz': selection.timeZone,
      'data-requires': String(selection.requiresTimeZoneSelection),
    },
    `${selection.countryCode}|${selection.timeZone}|${selection.locale}|${selection.requiresTimeZoneSelection}`,
  )
}

test('UserDateTimeProvider renders deterministic SSR local datetime from saved preferences', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UserDateTimeProvider,
      {
        profile: { countryCode: 'JP', timeZone: 'Asia/Tokyo', locale: 'en-GB', hourFormat: '24h' },
        browserTimeZone: 'UTC',
      },
      React.createElement(TimestampProbe, { instant: INSTANT }),
    ),
  )
  assert.match(html, /Asia\/Tokyo/)
  assert.match(html, /15:36:00/)
  assert.match(html, /15 Jul 2026/)
})

test('UserDateTimeProvider falls back safely to UTC for multi-zone country when browser zone is foreign', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      UserDateTimeProvider,
      {
        profile: { countryCode: 'US', locale: 'en-GB', hourFormat: '24h' },
        browserTimeZone: 'Asia/Kolkata',
      },
      React.createElement(TimestampProbe, { instant: INSTANT }),
    ),
  )
  assert.match(html, /data-field="tz">UTC</)
  assert.match(html, /06:36:00/)
})

test('useCountrySelection flags multi-timezone countries requiring explicit user selection', () => {
  const unresolvedHtml = renderToStaticMarkup(
    React.createElement(CountrySelectionProbe, {
      countryCode: 'US',
      browserTimeZone: 'Asia/Kolkata',
    }),
  )
  assert.match(unresolvedHtml, /US\|\|en-US\|true/)

  const resolvedHtml = renderToStaticMarkup(
    React.createElement(CountrySelectionProbe, {
      countryCode: 'US',
      browserTimeZone: 'America/Chicago',
    }),
  )
  assert.match(resolvedHtml, /US\|America\/Chicago\|en-US\|false/)

  const singleZoneHtml = renderToStaticMarkup(
    React.createElement(CountrySelectionProbe, {
      countryCode: 'IN',
      browserTimeZone: 'UTC',
    }),
  )
  assert.match(singleZoneHtml, /IN\|Asia\/Kolkata\|en-IN\|false/)
})
