/**
 * E2E：从 Electron 主进程角度启动 DSH 后端并解析 URL，
 * 验证 spawn 契约与 Node 版本门禁（backend.js 应派发系统 node >= 24）。
 * 运行：./node_modules/.bin/electron scripts/e2e-backend.js
 */

const { startBackend, resolveNodeBin } = require('../src/backend')
const { join } = require('node:path')
const os = require('node:os')

async function main() {
  console.log(`[e2e] electron execPath=${process.execPath}`)
  const nodeBin = resolveNodeBin()
  console.log(`[e2e] 后端 node=${nodeBin}`)
  const { url, stop } = await startBackend({
    repoDir: process.env.DSH_REPO || join(os.homedir(), 'dev', 'deepseek-harness'),
    dshHome: join(__dirname, '..', '..', '.selftest', 'dsh-home'),
    port: 0,
    onLog: (kind, line) => console.log(`[backend:${kind}] ${line}`),
  })
  console.log(`[e2e] 后端就绪：${url}`)
  await stop()
  console.log('[e2e] 已停止 ✅')
}

main().catch(err => {
  console.error('[e2e] 失败 ❌', err.message)
  process.exit(1)
})
