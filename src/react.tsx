import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  formatUserDate,
  formatUserDateTime,
  formatUserTime,
  getBrowserLocale,
  getBrowserTimeZone,
  resolveCountrySelectionPreferences,
  resolveUserDateTimePreferences,
  type CountrySelectionPreferences,
  type CountrySelectionPreferencesInput,
  type FormatUserDateTimeOptions,
  type UserDateTimePreferences,
  type UserDateTimeProfileInput,
} from './user-datetime.js'

export type TimestampInput = string | number | Date | null | undefined

export interface UserDateTimeContextValue {
  readonly preferences: UserDateTimePreferences
  readonly formatDateTime: (
    timestamp: TimestampInput,
    options?: FormatUserDateTimeOptions,
  ) => string
  readonly formatTime: (
    timestamp: TimestampInput,
    options?: FormatUserDateTimeOptions,
  ) => string
  readonly formatDate: (
    timestamp: TimestampInput,
    options?: FormatUserDateTimeOptions,
  ) => string
}

export interface UserDateTimeProviderProps {
  profile?: UserDateTimeProfileInput | null
  browserTimeZone?: string | null
  browserLocale?: string | null
  children?: ReactNode
}

const FALLBACK_PREFERENCES = resolveUserDateTimePreferences({ browserTimeZone: '', browserLocale: '' })

function useBrowserDefaults(enabled: boolean) {
  const [defaults, setDefaults] = useState({ zone: '', locale: '' })
  useEffect(() => {
    if (enabled) setDefaults({ zone: getBrowserTimeZone(), locale: getBrowserLocale() })
  }, [enabled])
  return defaults
}

const FALLBACK_CONTEXT_VALUE: UserDateTimeContextValue = Object.freeze({
  preferences: FALLBACK_PREFERENCES,
  formatDateTime: (value: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
    formatUserDateTime(value, { ...FALLBACK_PREFERENCES, ...options }),
  formatTime: (value: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
    formatUserTime(value, { ...FALLBACK_PREFERENCES, ...options }),
  formatDate: (value: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
    formatUserDate(value, { ...FALLBACK_PREFERENCES, ...options }),
})

const UserDateTimeContext = createContext<UserDateTimeContextValue>(FALLBACK_CONTEXT_VALUE)

/**
 * React Context provider supplying resolved country/timezone/locale display
 * preferences and bound UTC-to-local formatting helpers. Supports explicit
 * `browserTimeZone` and `browserLocale` props for deterministic SSR & tests.
 */
export function UserDateTimeProvider({
  profile = null,
  browserTimeZone,
  browserLocale,
  children,
}: UserDateTimeProviderProps) {
  const countryCode = profile?.countryCode ?? profile?.country_code ?? profile?.country ?? ''
  const timezone = profile?.timeZone ?? profile?.timezone ?? ''
  const locale = profile?.locale ?? ''
  const hourFormat = profile?.hourFormat ?? profile?.hour_format ?? ''
  const browser = useBrowserDefaults(browserTimeZone === undefined || browserLocale === undefined)
  const resolvedZone = browserTimeZone === undefined ? browser.zone : browserTimeZone
  const resolvedLocale = browserLocale === undefined ? browser.locale : browserLocale

  const preferences = useMemo(
    () =>
      resolveUserDateTimePreferences({
        profile: { countryCode, timeZone: timezone, locale, hourFormat },
        browserTimeZone: resolvedZone,
        browserLocale: resolvedLocale,
      }),
    [countryCode, timezone, locale, hourFormat, resolvedZone, resolvedLocale],
  )

  const value = useMemo<UserDateTimeContextValue>(
    () =>
      Object.freeze({
        preferences,
        formatDateTime: (timestamp: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
          formatUserDateTime(timestamp, { ...preferences, ...options }),
        formatTime: (timestamp: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
          formatUserTime(timestamp, { ...preferences, ...options }),
        formatDate: (timestamp: TimestampInput, options: FormatUserDateTimeOptions = {}) =>
          formatUserDate(timestamp, { ...preferences, ...options }),
      }),
    [preferences],
  )

  return <UserDateTimeContext.Provider value={value}>{children}</UserDateTimeContext.Provider>
}

/**
 * Reads the active `UserDateTimeContextValue` resolved by `UserDateTimeProvider`.
 */
export function useUserDateTime(): UserDateTimeContextValue {
  return useContext(UserDateTimeContext)
}

/**
 * Memoized React hook computing country-selection timezone/locale suggestions
 * and `requiresTimeZoneSelection` for multi-timezone country forms.
 */
export function useCountrySelection({
  countryCode,
  currentTimeZone,
  browserTimeZone,
}: CountrySelectionPreferencesInput = {}): CountrySelectionPreferences {
  const browser = useBrowserDefaults(browserTimeZone === undefined)
  const resolvedZone = browserTimeZone === undefined ? browser.zone : browserTimeZone
  return useMemo(
    () =>
      resolveCountrySelectionPreferences({
        countryCode,
        currentTimeZone,
        browserTimeZone: resolvedZone,
      }),
    [countryCode, currentTimeZone, resolvedZone],
  )
}
