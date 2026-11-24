import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { UserDateTimeProvider, useCountrySelection, useUserDateTime } from '../../dist/react.js'

const instant = '2026-07-15T06:36:00Z'
const root = fileURLToPath(new URL('../../', import.meta.url))

function Probe() {
  const { preferences, formatTime } = useUserDateTime()
  const selection = useCountrySelection({ countryCode: 'US' })
  return createElement('output', {}, [preferences.timeZone, formatTime(instant), selection.timeZone].join('|'))
}

test('real Chromium hydrates an explicit and an ambient provider without mismatches', async () => {
  const options = {
    profile: { countryCode: 'JP', timeZone: 'Asia/Tokyo', locale: 'en-GB', hourFormat: '24h' },
    browserTimeZone: '', browserLocale: '',
  }
  const profiles = { fixed: options, ambient: { profile: { locale: 'en-GB', hourFormat: '24h' } } }
  const markup = Object.entries(profiles).map(([id, props]) =>
    '<div id="' + id + '">' + renderToString(createElement(UserDateTimeProvider, props, createElement(Probe))) + '</div>',
  ).join('')
  assert.match(markup, /UTC\|06:36:00\|/)
  const contents = [
    "import { createElement } from 'react'",
    "import { hydrateRoot } from 'react-dom/client'",
    "import { UserDateTimeProvider, useCountrySelection, useUserDateTime } from './dist/react.js'",
    'const instant = ' + JSON.stringify(instant),
    'const profiles = ' + JSON.stringify(profiles),
    'const Probe = ' + Probe.toString(),
    'globalThis.hydrationErrors = []',
    'for (const [id, props] of Object.entries(profiles)) {',
    '  hydrateRoot(document.getElementById(id), createElement(UserDateTimeProvider, props, createElement(Probe)), {',
    '    onRecoverableError: (error) => globalThis.hydrationErrors.push(error.message),',
    '  })',
    '}',
  ].join('\n')
  const { outputFiles } = await build({
    absWorkingDir: root, stdin: { contents, resolveDir: root }, bundle: true,
    write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' },
  })

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  })
  try {
    const page = await browser.newPage({ timezoneId: 'America/Los_Angeles', locale: 'en-GB' })
    await page.route('**/*', (route) => route.abort())
    await page.setContent(markup)
    await page.addScriptTag({ content: outputFiles[0].text })
    await page.waitForFunction(() => document.querySelector('#ambient output')?.textContent
      ?.startsWith('America/Los_Angeles|23:36:00|America/Los_Angeles'))
    assert.match(await page.locator('#fixed output').textContent(), /^Asia\/Tokyo\|15:36:00\|/)
    assert.deepEqual(await page.evaluate(() => globalThis.hydrationErrors), [])
  } finally {
    await browser.close()
  }
})
