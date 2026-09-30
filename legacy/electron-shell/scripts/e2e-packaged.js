/**
 * 打包态 E2E：模拟应用首次启动流程——
 * 1) 定位 Resources 里的 dsh-runtime.tar.gz 并解压（同 ensureRuntime）；
 * 2) 通过 backend.js 的打包态解析（DSH_DESKTOP_RUNTIME_DIR）拉起后端。
 * 运行：ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/e2e-packaged.js [app资源目录]
 */

const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, rmSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { startBackend } = require('../src/backend')

const APP_RESOURCES = process.argv[2] || join(__dirname, '..', 'dist-app', 'mac-arm64', 'DSH Desktop.app', 'Contents', 'Resources')
const EXTRACT_DIR = join(__dirname, '..', '..', '.selftest', 'packaged-x')

async function main() {
  console.log(`[e2e-packaged] Resources=${APP_RESOURCES}`)
  if (!existsSync(APP_RESOURCES)) throw new Error(`找不到应用资源目录：${APP_RESOURCES}`)

  // 1) 解压运行时（模拟 ensureRuntime）
  const archive = join(APP_RESOURCES, 'dsh-runtime.tar.gz')
  if (!existsSync(archive)) throw new Error(`缺少 dsh-runtime.tar.gz：${archive}`)
  rmSync(EXTRACT_DIR, { recursive: true, force: true })
  mkdirSync(EXTRACT_DIR, { recursive: true })
  console.log('[e2e-packaged] 解压运行时…')
  execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', EXTRACT_DIR], { stdio: 'ignore' })
  console.log(`[e2e-packaged] 解压完成：${EXTRACT_DIR}`)

  // 2) 用打包态环境启动后端
  process.env.DSH_DESKTOP_RESOURCES = APP_RESOURCES
  process.env.DSH_DESKTOP_RUNTIME_DIR = EXTRACT_DIR
  const { url, stop } = await startBackend({
    dshHome: join(__dirname, '..', '..', '.selftest', 'dsh-home'),
    port: 0,
    onLog: (kind, line) => console.log(`[backend:${kind}] ${line}`),
  })
  console.log(`[e2e-packaged] 后端就绪：${url}`)
  await stop()
  console.log('[e2e-packaged] 已停止 ✅')
}

main().catch(err => {
  console.error('[e2e-packaged] 失败 ❌', err.message)
  process.exit(1)
})
