# Third-party notices and data provenance

The package distributes a generated data snapshot and its own runtime code. It has no required runtime dependencies. React and libphonenumber-js are optional external peers. Their runtime libraries are unavailable unless the consumer supplies them.

## Unicode region names

English region labels and their ordering come from Node.js 24.15.0, ICU 78.2 and its CLDR 48.0 bundle using `Intl.DisplayNames` and `Intl.Collator('en')`. The package includes the Unicode License v3 notice and the copyright and permission notice from the pinned CLDR 48 release. It distributes generated labels and their sort order. [Unicode License v3](licenses/Unicode-3.0.txt) · [CLDR 48 notice](licenses/Unicode-CLDR-48.txt) · [Unicode release information](https://unicode.org/releases/)

## IANA timezones

The country association source is the IANA release `tzdata2026a` file `zone.tab`, vendored as `data/iana-zone.tab` in the source repository. The generator verifies its LF SHA-256 `586b4207e6c76722de82adcda6bf49d761f668517f45a673f64da83b333eecc4`. The original release archive SHA-256 is `77b541725937bb53bd92bd484c0b43bec8545e2d3431ee01f04ef8f2203ba2b7`. The package includes the generated country mapping, the generator runtime's Intl zone list, UTC and a small set of current IANA spelling aliases. The 435 bundled strings include aliases and are not 435 distinct timezone-rule sets. The country-oriented IANA table supplies 247 mapped ISO codes. A country may have more than one identifier because its offset history differs across regions. [IANA source archive](https://data.iana.org/time-zones/releases/tzdata2026a.tar.gz) · [IANA data license](licenses/IANA-tzdb.txt)

The generator also reads aliases from `data/iana-backward`, the `backward` file from the same release, with LF SHA-256 `d2f4c8953f204982ddf4dc0c2debf41b2464de376dad7d546d0fc70f889fa706`. IANA places these files in the public domain. The packaged notice identifies the license exceptions for other files in the larger upstream project. The consumer's Intl runtime provides formatting rules and may lack recent identifiers.

## Calling codes and phone validation

The generator reads only country ISO codes and their calling prefixes from locked libphonenumber-js 1.13.17. It redistributes the resulting small table of codes and prefixes as an adapted extract. It ships neither the complete national numbering-plan database nor the library implementation. The optional phone peer is external. libphonenumber-js is MIT-licensed and carries an Apache-2.0 license for Google-derived metadata. Both upstream license files are distributed in [licenses/libphonenumber-js-MIT.txt](licenses/libphonenumber-js-MIT.txt) and [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt). [libphonenumber-js licensing](https://github.com/catamphetamine/libphonenumber-js/blob/master/README.md#license) · [Google libphonenumber license](https://github.com/google/libphonenumber/blob/master/LICENSE)

The 249-country ISO list includes seven territory rows omitted by that library. The generator supplies +262 for the French Southern Territories and folds Ascension and Tristan da Cunha into ISO SH with separate +247 and +290 options. The affected ITU notes identify those relationships. AQ, BV, GS, HM, PN and UM have an empty list because the reviewed inputs did not establish a calling choice for those rows. A missing prefix describes coverage of this dataset. [ITU-T E.164 assignment table](https://www.itu.int/dms_pub/itu-t/opb/sp/T-SP-E.164D-2016-PDF-E.pdf)

## Optional and development software

React is an MIT-licensed optional peer. TypeScript is Apache-2.0. The lockfile records development dependency licenses and integrity values, including Playwright and esbuild for synthetic browser tests. Neither development tools nor optional peers are bundled into the release.

The generator and distribution use no dependency or data from the ODbL-licensed world-countries package. The [project MIT license](LICENSE) covers the project's original work. The notices above identify terms for the upstream inputs.
