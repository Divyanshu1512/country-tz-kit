# Security Policy

## Reporting a Vulnerability

For a suspected security issue, use **Report a vulnerability** on the [GitHub Security page](https://github.com/Divyanshu1512/country-tz-kit/security). Include the affected version, runtime and the smallest synthetic example that shows the issue. Use a public issue for ordinary bugs.

## Security Scope

`country-tz-kit` is an offline formatting and input-validation library. In particular:

- **Validation is not authentication or verification:** `normalizeInternationalPhone` and `validateInternationalPhone` check syntax and numbering-plan structure only; they do **not** verify phone ownership or replace OTP/MFA.
- **Input bounds:** String lookup and parsing APIs check length before normalization or validation. The low-level text validator has a 1,024-code-unit cap regardless of caller options. This validation does not replace application request-size limits or output escaping.
- **Zero network I/O:** Core exports never perform HTTP requests, DNS lookups, or browser geolocation reads.

## Supported Versions

Security fixes apply to the latest maintained minor version.
