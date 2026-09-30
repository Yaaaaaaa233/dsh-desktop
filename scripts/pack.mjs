import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import './check.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const catalog = JSON.parse(readFileSync(path.join(root, 'catalog.json'), 'utf8'))
const project = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const output = path.join(root, 'dist')
mkdirSync(output, { recursive: true })
const args = process.argv.slice(2)
let skinArchive
if (args.length) {
  assert.equal(args.length, 2, 'usage: npm run pack -- [--skin-archive /path/package.tgz]')
  assert.equal(args[0], '--skin-archive')
  skinArchive = path.resolve(args[1])
}
const sha256 = content => createHash('sha256').update(content).digest('hex')
const integrity = content => `sha512-${createHash('sha512').update(content).digest('base64')}`
const files = []
const whale = catalog.plugins.find(plugin => plugin.kind === 'local')
const npmArgs = ['pack', '--ignore-scripts', '--json', '--pack-destination', output]
const npm = process.env.npm_execpath
const packed = spawnSync(npm ? process.execPath : 'npm', npm ? [npm, ...npmArgs] : npmArgs, {
  cwd: path.join(root, whale.path), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, NPM_CONFIG_CACHE: path.join(root, '.cache/npm') },
})
assert.equal(packed.status, 0, packed.stderr || packed.error?.message)
const [entry] = JSON.parse(packed.stdout)
assert.equal(entry.filename, whale.artifact)
for (const filename of ['lib/index.js', 'lib/client.js', 'lib/accounting.mjs', 'assets/whale-widget.js', 'LICENSE', 'PROVENANCE.md', 'ADAPTATION.md']) {
  assert.ok(entry.files.some(file => file.path === filename), `tarball missing ${filename}`)
}
const whaleBytes = readFileSync(path.join(output, whale.artifact))
files.push({ name: whale.name, version: whale.version, filename: whale.artifact,
  sha256: sha256(whaleBytes), integrity: integrity(whaleBytes), origin: 'local-adaptation' })

const skin = catalog.plugins.find(plugin => plugin.kind === 'upstream')
let skinBytes
if (skinArchive) {
  skinBytes = readFileSync(skinArchive)
} else {
  const response = await fetch(skin.tarball, { signal: AbortSignal.timeout(60000) })
  assert.ok(response.ok, `skin download failed: HTTP ${response.status}`)
  skinBytes = Buffer.from(await response.arrayBuffer())
}
assert.equal(integrity(skinBytes), skin.integrity, 'upstream skin tarball integrity mismatch')
writeFileSync(path.join(output, skin.artifact), skinBytes)
files.push({ name: skin.name, version: skin.version, filename: skin.artifact,
  sha256: sha256(skinBytes), integrity: skin.integrity, origin: skin.tarball })
writeFileSync(path.join(output, 'SHA256SUMS'), files.map(file => `${file.sha256}  ${file.filename}\n`).join(''))
writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify({
  projectVersion: project.version, testedEnvironment: catalog.testedEnvironment,
  runtimeReference: whale.verification.installedVersion, files,
}, null, 2) + '\n')
for (const file of files) console.log(`${file.filename}: ${file.sha256}`)
console.log('Packages created in dist/. No DSH profile was modified.')
