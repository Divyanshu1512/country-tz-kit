# country-tz-kit

Offline ISO 3166-1 country & dialing-code metadata, multi-timezone-safe IANA timezone resolution, UTC-to-local `Intl.DateTimeFormat` formatting, strict Unicode contact validation, and optional React and E.164 phone subpaths.

## Build from source

Version 0.1.0 is available as source on GitHub. Build and create a local tarball with Node 24.15.0:

```bash
git clone https://github.com/Divyanshu1512/country-tz-kit.git
cd country-tz-kit
npm ci
npm pack
```

Install the resulting `country-tz-kit-0.1.0.tgz` from its local path in a consumer project. The React and phone entrypoints require their respective peer dependencies.

## Why `country-tz-kit`?

Global applications routinely hit four subtle internationalization bugs:

1. **Guessing a capital city for multi-timezone countries:** Selecting `US`, `CA`, `AU`, `BR`, `MX`, `RU`, or `ID` and silently defaulting users to a single city timezone displays wrong local times for millions of users. `country-tz-kit` never assigns an arbitrary default timezone to multi-timezone countries — it validates whether the browser timezone actually belongs to the selected country (`timezoneBelongsToCountry`) and otherwise prompts for explicit selection (`requiresTimeZoneSelection: true`).
2. **Shared calling-code collisions:** Relying on raw calling codes (`+1`, `+44`) cannot distinguish United States vs. Canada vs. Bahamas, or dual-code territories (`SH:+290` vs. `SH:+247`). `DIALING_OPTIONS` keys every option uniquely by `CC:+NNN`.
3. **Runtime network dependencies for static country tables:** All 249 ISO 3166-1 country codes, 244 verified dialing options, and the IANA identifier snapshot are available offline with **zero required runtime dependencies**.
4. **Unicode spoofing and malformed contact text:** The optional `./validation` subpath normalizes international scripts (Latin, Devanagari, Arabic, Cyrillic, Han, Hangul, Indic ZWJ/ZWNJ) to NFC while rejecting bidirectional overrides/isolates, C0/C1 control characters, lone surrogates, HTML angle brackets, and oversized payloads before normalization.

## Package Entrypoints

| Subpath | Runtime Dependencies | Purpose |
|---|---|---|
| `country-tz-kit` (root) | **None** | Country/dialing metadata + multi-timezone-safe IANA timezone resolution + `Intl` formatting |
| `country-tz-kit/country-metadata` | **None** | Offline 249 ISO 3166-1 countries, 244 dialing options, aliases and an IANA identifier snapshot |
| `country-tz-kit/datetime` | **None** | Multi-timezone country rules, preference precedence, immutable UTC-to-local formatting |
| `country-tz-kit/validation` | **None** | Strict Unicode NFC/bidi-safe person name, city, address, optional text, and display-preference validators |
| `country-tz-kit/phone` | Optional peer `libphonenumber-js >= 1.12.0` | National trunk-prefix & E.164 phone normalization and strict calling-code validation |
| `country-tz-kit/react` | Optional peer `react >= 18.0.0` | `UserDateTimeProvider`, `useUserDateTime`, and `useCountrySelection` hooks |

## Quick Examples

### Multi-Timezone-Safe Country Selection & UTC Formatting

```ts
import {
  formatUserDateTime,
  resolveCountrySelectionPreferences,
  resolveUserDateTimePreferences,
} from 'country-tz-kit'

// Multi-timezone country + foreign browser timezone => never guesses New York
const selection = resolveCountrySelectionPreferences({
  countryCode: 'US',
  browserTimeZone: 'Asia/Kolkata',
})
// { countryCode: 'US', timeZone: '', locale: 'en-US', requiresTimeZoneSelection: true }

// Deterministic fallback order: saved zone -> allowed browser zone -> single-zone default -> UTC
const prefs = resolveUserDateTimePreferences({
  profile: { countryCode: 'JP', locale: 'en-GB', hourFormat: '24h' },
  browserTimeZone: '',
})
// { countryCode: 'JP', timeZone: 'Asia/Tokyo', locale: 'en-GB', hourFormat: '24h' }

formatUserDateTime('2026-07-15T06:36:00.000Z', prefs)
// "15 Jul 2026, 15:36:00"
```

### Strict Unicode Contact Validation (`country-tz-kit/validation`)

```ts
import { validateContactFields, validatePersonName } from 'country-tz-kit/validation'

validatePersonName('Léa O’Brien') // { valid: true, text: "Léa O’Brien" }
validatePersonName('Aarav\u202e') // { valid: false, text: '' } (bidi override rejected)

const result = validateContactFields({
  fullName: 'Aarav Patel',
  country: 'India',
  city: 'Exampleton',
  addressLine1: '42 Fictional Avenue',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  hourFormat: '24h',
})
```

### Strict E.164 Phone Validation (`country-tz-kit/phone`)

```ts
import { normalizeInternationalPhone, validateInternationalPhone } from 'country-tz-kit/phone'

normalizeInternationalPhone('020 7946 0018', '+44') // '+442079460018'
validateInternationalPhone('020 7946 0018', '+44')  // '+442079460018'
validateInternationalPhone('+442079460018', '+91')  // null (calling code mismatch)
validateInternationalPhone('9999999999', '+91')     // null (uniform repeated digits)
```

### React Provider & Hook (`country-tz-kit/react`)

```tsx
import { UserDateTimeProvider, useCountrySelection, useUserDateTime } from 'country-tz-kit/react'

function EventTime({ iso }: { iso: string }) {
  const { formatDateTime } = useUserDateTime()
  return <time dateTime={iso}>{formatDateTime(iso)}</time>
}

export function App() {
  const selection = useCountrySelection({ countryCode: 'CA', browserTimeZone: 'America/Toronto' })
  return (
    <UserDateTimeProvider profile={{ countryCode: 'CA', timeZone: selection.timeZone }}>
      <EventTime iso="2026-07-15T06:36:00.000Z" />
    </UserDateTimeProvider>
  )
}
```

## Reproducible Offline Dataset Generation

`src/generated/metadata.ts` is generated with Node 24.15.0, ICU 78.2, CLDR 48.0, tzdb 2026a, the vendored and hash-checked IANA `zone.tab` and `backward` files, and locked libphonenumber-js 1.13.17. The runtime requires Node 20.0.0 or newer. The generator requires the exact tuple.

```bash
npm run generate:data   # Regenerate src/generated/metadata.ts from Node ICU/CLDR + libphonenumber-js + IANA TZDB
npm run check:data      # Verify checked-in generated file matches generator output byte-for-byte
```

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for complete upstream provenance and licensing details.

## Input and runtime behavior

- Country selection accepts a valid existing or browser timezone only if the IANA country table permits it. It suggests a default only for a single-entry country supported by the caller's Intl runtime. A multi-entry country without a matching choice, or a country without supported mappings, requires explicit resolution. Formatting preferences fall back to UTC when no compatible value is available.
- `resolveDialingSelectionResult` returns `selected`, `ambiguous`, `conflict`, `invalid`, or `unset`. A shared calling code alone leaves the country ambiguous. An incompatible explicit country/code pair identifies a conflict. The string helper returns an empty string unless there is a unique selection.
- Absolute time inputs accept a valid Date, epoch milliseconds, or an ISO timestamp ending in `Z` or an explicit `±HH:MM` offset. Offsetless, date-only and invalid calendar strings return the configured invalid fallback.
- React renders with deterministic initial locale and timezone preferences. Browser values apply after hydration. Pass the same explicit preferences on server and client for personalized SSR. When server and browser have different Intl data and byte-identical localized text is required, serialize the displayed value or defer localized rendering to the client.
- The bundled list exposes the pinned identifiers. `getTrustedIanaTimeZones()` offers zones supported by the installed Intl version that pass display preference validation. A legacy alias keeps the country membership of any equivalent entry in `zone.tab`. Pinned IANA links provide a fallback for retired names with no equivalent current entry. Intl supplies the formatting rules. Older runtimes can lack recent zones, including Coyhaique on the tested Node 20.0.0, 20.19.0, and 22.15.0 builds.

## Local Development & Verification

```bash
npm ci
npm exec -- playwright-core install chromium
npm run verify          # Pinned data, types, runtime tests, Chromium and release audit
npm run pack:check      # Builds and checks the actual local npm archive against its allowlist
```

## Licensing & Notices

- **Project license** [MIT](./LICENSE).
- **Third-Party Notices**: See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
- **Security Policy**: See [SECURITY.md](./SECURITY.md).
