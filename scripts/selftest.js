/**
 * 无头自检：不依赖 Electron，验证 backend / settings / styles 三个纯 Node 模块。
 * 运行：node scripts/selftest.js
 * 会真实启动一次 DSH 后端（需要 DSH 仓库已 build），然后将其停止。
 */

const { join } = require('node:path')
const assert = require('node:assert/strict')

const { load, save, mergeSettings, DEFAULTS } = require('../src/settings')
const { buildCss, themeColorCss, backgroundCss } = require('../src/styles')
const { startBackend, resolveBackendPaths, URL_LINE_RE } = require('../src/backend')

const WORKSPACE = join(__dirname, '..', '..')

async function main() {
  console.log('1) settings.js')
  const file = join(WORKSPACE, '.selftest', 'settings.json')
  save(file, { themeColor: '#ff8800', background: { kind: 'gradient' }, customCss: 'a{}' })
  const s = load(file)
  assert.equal(s.themeColor, '#ff8800')
  assert.equal(s.background.kind, 'gradient')
  assert.equal(s.background.color, DEFAULTS.background.color, '未提供的 background 字段应保留默认')
  assert.equal(s.customCss, 'a{}')
  const merged = mergeSettings(DEFAULTS, { background: { kind: 'image', imagePath: '/x.png' } })
  assert.equal(merged.background.kind, 'image')
  assert.equal(merged.background.color, DEFAULTS.background.color)
  console.log('   ok')

  console.log('2) styles.js')
  const theme = themeColorCss('#ff8800')
  assert.match(theme, /--dsw-static-deepseek-500:\s*#ff8800|--dsw-static-deepseek-500:\s*rgb\(255, 136, 0\)/)
  assert.equal(themeColorCss(''), '')
  const colorCss = backgroundCss({ kind: 'color', color: '#123456' }, '')
  assert.match(colorCss, /--dsw-alias-bg-base:\s*#123456/)
  const gradCss = backgroundCss({ kind: 'gradient', gradientFrom: '#000000', gradientTo: '#ffffff', gradientAngle: 90 }, '')
  assert.match(gradCss, /linear-gradient\(90deg, #000000, #ffffff\)/)
  const imgCss = backgroundCss({ kind: 'image', imageOpacity: 0.5, overlay: 'rgba(1, 2, 3, 0.4)' }, 'data:image/png;base64,AAA')
  assert.match(imgCss, /url\('data:image\/png;base64,AAA'\)/)
  assert.match(imgCss, /rgba\(1, 2, 3, 0\.4\)/)
  const full = buildCss({ themeColor: '#ff8800', background: { kind: 'color', color: '#123456' }, customCss: '.x{color:red}' }, '')
  assert.ok(full.includes('.x{color:red}'))
  assert.ok(full.indexOf('.x{color:red}') > full.indexOf('--dsw-alias-bg-base'), '自定义 CSS 应排在最末尾')
  console.log('   ok')

  console.log('3) backend.js（真实启动一次 DSH 后端）')
  assert.match('dsh web: http://127.0.0.1:61487', URL_LINE_RE)
  const paths = resolveBackendPaths(process.env.DSH_REPO || join(require('node:os').homedir(), 'dev', 'deepseek-harness'))
  assert.ok(paths.bin.endsWith('lib/bin.js'))
  const { url, stop } = await startBackend({
    repoDir: process.env.DSH_REPO || join(require('node:os').homedir(), 'dev', 'deepseek-harness'),
    dshHome: join(WORKSPACE, '.selftest', 'dsh-home'),
    port: 0,
    onLog: () => {},
  })
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/)
  console.log(`   后端就绪：${url}`)
  await stop()
  console.log('   已停止')

  console.log('\n全部通过 ✅')
}

main().catch(err => {
  console.error('\n自检失败 ❌', err)
  process.exit(1)
})
