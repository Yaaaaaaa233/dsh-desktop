/**
 * 把 runtime/（pnpm deploy 的 DSH 运行时）打包成单文件归档 resources/dsh-runtime.tar.gz，
 * 供 electron-builder extraResources 携带；应用首次启动时解压到 userData。
 * 运行：node scripts/make-runtime-archive.js
 */

const { execFileSync } = require('node:child_process')
const { mkdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
// 输入/输出都可用环境变量覆盖，便于并行保留多个内核版本的运行时。
const RUNTIME = process.env.DSH_RUNTIME_DIR || join(ROOT, 'runtime')
const OUT = process.env.DSH_RUNTIME_ARCHIVE || join(ROOT, 'resources', 'dsh-runtime.tar.gz')

mkdirSync(join(ROOT, 'resources'), { recursive: true })

if (!require('node:fs').existsSync(join(RUNTIME, 'node_modules'))) {
  console.error('runtime/node_modules 不存在，请先运行部署与修复：\n' +
    '  pnpm --filter @deepseek-ai/dsh deploy --legacy runtime（在 DSH 仓库）\n' +
    '  node scripts/repair-runtime.js')
  process.exit(1)
}

execFileSync('tar', ['-czf', OUT, '--exclude=node_modules/.cache', '-C', RUNTIME, '.'], { stdio: 'inherit' })
const size = statSync(OUT).size
console.log(`归档完成：${OUT}（${(size / 1048576).toFixed(1)}MB）`)
