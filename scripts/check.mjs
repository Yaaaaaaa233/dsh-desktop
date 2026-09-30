import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const json = name => JSON.parse(readFileSync(path.join(root, name), 'utf8'))
const catalog = json('catalog.json')
const project = json('package.json')
assert.equal(catalog.schemaVersion, 1)
assert.equal(project.private, true, 'the repository root is not a DSH plugin')
assert.equal(project.version, '0.2.0')
assert.equal(catalog.testedEnvironment.dsh, '0.2.0-rc.2')

const allFiles = directory => readdirSync(directory).flatMap(name => {
  const filename = path.join(directory, name)
  return statSync(filename).isDirectory() ? allFiles(filename) : [filename]
})
const whale = catalog.plugins.find(plugin => plugin.id === 'whale')
const pkg = json(`${whale.path}/package.json`)
assert.equal(pkg.name, whale.name)
assert.equal(pkg.version, whale.version)
assert.equal(pkg.dsh.engines.dsh, catalog.testedEnvironment.dsh)
assert.equal(pkg.exports['./client'], './lib/client.js')
assert.equal(pkg.dsh.client.platform, 'web')
assert.equal(pkg.repository.directory, whale.path)
for (const [filename, expected] of Object.entries(whale.verification.runtimeSha256)) {
  const content = readFileSync(path.join(root, whale.path, filename))
  assert.equal(createHash('sha256').update(content).digest('hex'), expected,
    `${filename} differs from the verified runtime; update the verification record after testing`)
}
for (const filename of ['LICENSE', 'PROVENANCE.md', 'README.md', 'UPSTREAM_README.md', 'ADAPTATION.md', 'cordis.patch.yml']) {
  assert.ok(existsSync(path.join(root, whale.path, filename)), `missing ${filename}`)
}
const activeSources = [...allFiles(path.join(root, whale.path)), ...allFiles(path.join(root, 'scripts')), ...allFiles(path.join(root, 'tests'))]
for (const filename of activeSources) {
  if (/\.(?:mjs|js)$/.test(filename)) {
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(!/\/(?:Users|home)\/[^/\s]+\/(?:Documents|Desktop)\//.test(readFileSync(filename, 'utf8')), `personal path in ${filename}`)
  }
}
const skin = catalog.plugins.find(plugin => plugin.id === 'skin-center')
assert.equal(skin.kind, 'upstream')
assert.equal(skin.version, '0.4.4')
assert.ok(skin.tarball.startsWith('https://registry.npmjs.org/'))
assert.match(skin.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
assert.equal(catalog.plugins.find(plugin => plugin.id === 'adaptive-plan').distributed, false)

const docs = [path.join(root, 'README.md'), ...allFiles(path.join(root, 'docs')),
  path.join(root, whale.path, 'README.md'), path.join(root, 'integrations/skin-center/README.md')]
for (const filename of docs) {
  for (const [, target] of readFileSync(filename, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(target)) continue
    assert.ok(existsSync(path.resolve(path.dirname(filename), target.split('#')[0])),
      `broken local link in ${path.relative(root, filename)}: ${target}`)
  }
}
console.log('Catalog, verified runtime digests, syntax, package entries and documentation links passed.')
