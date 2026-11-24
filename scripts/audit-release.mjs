#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../', import.meta.url))
const utf8 = new TextDecoder('utf-8', { fatal: true })
const allowedLicenses = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'MIT-0', 'Unicode-3.0'])
const signals = [
  ['private-host', /\b(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:supabase\.co|run\.app|workers\.dev|pages\.dev|internal|local)(?=[:/\s"'\\]|$)/i],
  ['workstation-path', /(?:[a-z]:[\\/]{1,2}users[\\/]{1,2}|\/(?:mnt\/[a-z]\/)?users\/)/i],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['jwt', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['provider-token', /\b(?:sb_(?:secret|publishable)_|gh[pousr]_|github_pat_|rzp_(?:live|test)_|sk_(?:live|test)_)[A-Za-z0-9_-]{12,}\b/],
  ['aws-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['payment-plan-id', /\bplan_[A-Za-z0-9]{12,}\b/],
]
const MAX_FILE_BYTES = 2 * 1024 * 1024

function staticEscapes(text) {
  return text.replace(/\\u(?:\{([0-9a-f]{1,6})\}|([0-9a-f]{4}))|\\x([0-9a-f]{2})/gi,
    (source, point, unicode, byte) => {
      const value = Number.parseInt(point || unicode || byte, 16)
      return value <= 0x10ffff ? String.fromCodePoint(value) : source
    }).replace(/(?:%[0-9a-f]{2})+/gi, (part) => {
    try { return decodeURIComponent(part) } catch { return part }
  })
}

export function scanReleaseText(text, privateIndicators = []) {
  const decoded = staticEscapes(text)
  const variants = new Set([text, decoded, staticEscapes(decoded)])
  for (const source of [...variants]) {
    for (const [token] of source.matchAll(/(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{16,512}={0,2}(?![A-Za-z0-9+/_-])/g)) {
      try {
        const value = utf8.decode(Buffer.from(token, 'base64url'))
        if (/^[\x20-\x7e\r\n]+$/.test(value)) variants.add(staticEscapes(value))
      } catch { /* Binary or malformed data is not an encoded text sample. */ }
    }
  }
  const findings = new Set()
  for (const value of variants) {
    const lower = value.toLowerCase()
    if (privateIndicators.some((literal) => lower.includes(literal))) findings.add('private-inventory')
    for (const [code, pattern] of signals) {
      if (pattern.test(value)) findings.add(code)
    }
  }
  return [...findings].sort()
}

function sourceFiles() {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--deduplicate'],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix + entry.name
    return entry.isDirectory() ? walk(join(dir, entry.name), path + '/') : [path]
  })
}

function tarFiles(raw) {
  const data = gunzipSync(raw, { maxOutputLength: 4 * MAX_FILE_BYTES })
  const files = new Map()
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = header.toString('ascii', 0, 100).split('\0')[0]
    const lengthText = header.toString('ascii', 124, 136).replace(/\0/g, '').trim()
    const length = Number.parseInt(lengthText, 8)
    offset += 512
    if (!name.startsWith('package/') || header[156] !== 48 || !/^[0-7]+$/.test(lengthText) ||
        length > MAX_FILE_BYTES || offset + length > data.length || files.has(name)) {
      throw new Error('Invalid or unsupported npm tarball entry')
    }
    files.set(name, data.subarray(offset, offset + length))
    offset += Math.ceil(length / 512) * 512
  }
  return files
}

function requireSameNames(actual, expected, label) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(label + ' inventory differs from the approved allowlist')
  }
}

function audit() {
  const indicatorFile = process.env.RELEASE_PRIVATE_INDICATORS_FILE
  const privateIndicators = indicatorFile
    ? JSON.parse(readFileSync(indicatorFile, 'utf8')).map((literal) => {
      if (typeof literal !== 'string' || literal.length < 6) throw new Error('Invalid private indicator')
      return literal.toLowerCase()
    })
    : []
  const failures = []
  const inspected = new Set()
  const check = (name, bytes) => {
    inspected.add(name)
    for (const code of scanReleaseText(utf8.decode(bytes), privateIndicators)) failures.push({ path: name, code })
  }
  const approved = JSON.parse(readFileSync(join(root, 'scripts/package-files.json'), 'utf8'))
  const sources = sourceFiles()
  const built = walk(join(root, 'dist'), 'dist/')
  requireSameNames(built, approved.filter((name) => name.startsWith('dist/')), 'Built')
  for (const path of new Set([...sources, ...built])) {
    const absolute = join(root, path)
    const stat = lstatSync(absolute)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || path.endsWith('.map') || path.split('/').includes('.git')) {
      failures.push({ path, code: 'unsupported-file' })
      continue
    }
    check(path, readFileSync(absolute))
  }

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  if (Object.keys(pkg.dependencies ?? {}).length) failures.push({ code: 'required-runtime-dependencies' })
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue
    if (!allowedLicenses.has(entry.license) || !entry.integrity ||
        new URL(entry.resolved).origin !== 'https://registry.npmjs.org' || name.endsWith('/world-countries')) {
      failures.push({ path: name, code: 'unapproved-dependency' })
    }
  }
  if (process.argv.includes('--local-only')) {
    const remotes = execFileSync('git', ['remote'], { cwd: root, encoding: 'utf8' }).trim()
    if (remotes || pkg.private !== true) failures.push({ code: 'local-only-contract' })
  }
  if (!process.env.npm_execpath) throw new Error('Use npm run audit:release or npm run audit:local')
  const temporary = mkdtempSync(join(tmpdir(), 'country-tz-kit-pack-'))
  try {
    const [packed] = JSON.parse(execFileSync(process.execPath, [
      process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary,
    ], { cwd: root, encoding: 'utf8' }))
    if (isAbsolute(packed.filename) || /[\\/]/.test(packed.filename)) throw new Error('Invalid tarball filename')
    requireSameNames(packed.files.map(({ path }) => path), approved, 'npm')
    const archive = tarFiles(readFileSync(join(temporary, packed.filename)))
    requireSameNames(archive.keys(), approved.map((name) => 'package/' + name), 'Archive')
    for (const [name, bytes] of archive) {
      if (!bytes.equals(readFileSync(join(root, name.slice('package/'.length))))) {
        failures.push({ path: name, code: 'archive-bytes-differ' })
      }
      check(name, bytes)
    }
    console.log(JSON.stringify({
      sourceFiles: sources.length, filesInspected: inspected.size, packageFiles: archive.size,
      packageIntegrity: packed.integrity, privateInventoryUsed: Boolean(indicatorFile), failures,
    }, null, 2))
  } finally {
    if (dirname(temporary) === resolve(tmpdir())) rmSync(temporary, { recursive: true, force: true })
  }
  if (failures.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) audit()
