# Changelog

All notable changes to `country-tz-kit` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Initial source release

### Added
- Pinned offline generator with 249 ISO country codes, 244 dialing choices and country-to-zone associations from IANA tzdb 2026a. Four previously inferred territory prefixes were removed because the cited inputs did not verify those mappings.
- Reject conflicting or ambiguous dialing selections and offsetless timestamp strings. Keep ambient browser preferences out of React's initial hydration render.
- Zero-dependency core exports (`country-tz-kit`, `./country-metadata`, `./datetime`) with multi-timezone country safeguards (`isMultiTimezoneCountry`, `timezoneBelongsToCountry`, `resolveCountrySelectionPreferences`, `resolveUserDateTimePreferences`) and immutable UTC-to-local `Intl` formatting (`formatUserDateTime`, `formatUserTime`, `formatUserDate`).
- Zero-dependency `./validation` subpath implementing strict Unicode NFC normalization and rejection of bidi overrides/isolates, control characters, lone surrogates, HTML angle brackets, and oversized payloads for international names, cities, addresses, and display preferences.
- Optional `./phone` subpath (`libphonenumber-js` optional peer) with national trunk-prefix normalization and strict calling-code-bound E.164 validation.
- Optional `./react` subpath (`react` optional peer) exporting `UserDateTimeProvider`, `useUserDateTime`, and `useCountrySelection`.
- Full TypeScript declarations (`.d.ts`), deterministic `node:test` suites, synthetic examples, third-party notices, an MIT license, and a release audit in CI.

### Security & Licensing Notes
- Completely eliminated `world-countries` (`ODbL-1.0` share-alike database license) in favor of Node.js ICU/CLDR `Intl.DisplayNames` (`Unicode-3.0`).
- Initial distribution is GitHub source. The npm manifest keeps registry publication disabled.

### Fixed
- Keep valid legacy timezone names on Node 20.0.0 when IANA links identify their current timezone. Verify that every offered timezone passes display preference validation.
