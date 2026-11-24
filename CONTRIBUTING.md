# Contributing to `country-tz-kit`

Thank you for your interest in contributing.

## Development Workflow

1. Use `.nvmrc` for data generation and release verification. Use the Node versions listed in CI for runtime compatibility tests.
2. Install dependencies with `npm ci`. Install Chromium with `npm exec -- playwright-core install chromium` or set `CHROMIUM_EXECUTABLE` to an existing Chromium executable.
3. Run the full verification pipeline before opening a pull request:
   ```bash
   npm run verify
   ```
   This checks metadata parity, typing, ESM and declarations, runtime tests, browser hydration and the release audit.

## Dataset Updates

Do **not** edit `src/generated/metadata.ts` by hand. When updating `libphonenumber-js` or Node.js ICU/IANA TZDB versions:

1. Run `npm run generate:data`.
2. Verify all tests pass (`npm run verify`).
3. Update `THIRD_PARTY_NOTICES.md` if any upstream package version or notice text changed.
4. Never introduce copyleft or share-alike database packages (e.g., `ODbL-1.0`, `GPL`, `AGPL`, `LGPL`) into `package.json` or generated datasets.

The release audit lives in the GitHub source for contributors and CI. It is excluded from the npm runtime archive. It checks Git's tracked and non-ignored source inventory, the entire build output, and the archive bytes against `scripts/package-files.json`. A private organization's optional literal denylist is supplied from outside the checkout as a JSON string array through `RELEASE_PRIVATE_INDICATORS_FILE`. Keep that file private. The audit reports filenames and finding classes and complements independent source and artifact scans.

## Scope & Quality Principles

- Keep the root (`.`), `./country-metadata`, `./datetime`, and `./validation` subpaths **zero required runtime dependencies** and strictly offline (no `fetch`, geolocation, or network APIs).
- Never default multi-timezone countries to an arbitrary city timezone.
- All new validation or formatting behavior must include deterministic boundary tests (DST transitions, Unicode control/bidi characters, and oversized input bounds).
- Use synthetic, fictional data only in tests and examples.
