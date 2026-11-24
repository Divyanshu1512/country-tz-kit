import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

test('every declared package.json subpath export has built ESM JS and TypeScript .d.ts files', async () => {
  for (const [subpath, target] of Object.entries(PKG.exports)) {
    const jsPath = join(ROOT, target.import)
    const dtsPath = join(ROOT, target.types)
    assert.equal(existsSync(jsPath), true, `Missing JS export for ${subpath}: ${target.import}`)
    assert.equal(existsSync(dtsPath), true, `Missing .d.ts export for ${subpath}: ${target.types}`)
  }

  const rootMod = await import('../dist/index.js')
  assert.equal(typeof rootMod.resolveCountryCode, 'function')
  assert.equal(typeof rootMod.formatUserDateTime, 'function')
  assert.equal(typeof rootMod.resolveUserDateTimePreferences, 'function')

  const valMod = await import('../dist/validation.js')
  assert.equal(typeof valMod.validatePersonName, 'function')
  assert.equal(typeof valMod.validateContactFields, 'function')

  const phoneMod = await import('../dist/phone.js')
  assert.equal(typeof phoneMod.normalizeInternationalPhone, 'function')
  assert.equal(typeof phoneMod.validateInternationalPhone, 'function')

  const reactMod = await import('../dist/react.js')
  assert.equal(typeof reactMod.UserDateTimeProvider, 'function')
  assert.equal(typeof reactMod.useUserDateTime, 'function')
  assert.equal(typeof reactMod.useCountrySelection, 'function')
})

test('core and validation builds have zero external runtime imports and zero source maps', () => {
  assert.equal(PKG.dependencies, undefined)

  const distFiles = readdirSync(join(ROOT, 'dist'), { recursive: true }).map(String)
  assert.equal(distFiles.some((f) => f.endsWith('.map')), false, 'dist must not emit .map source maps')

  for (const coreFile of ['index.js', 'country-metadata.js', 'user-datetime.js', 'validation.js']) {
    const code = readFileSync(join(ROOT, 'dist', coreFile), 'utf8')
    assert.doesNotMatch(code, /from ['"](?:react|libphonenumber-js)/, `${coreFile} must stay zero-dependency`)
  }
})
