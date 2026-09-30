/**
 * 统一检查更新：聚合三层更新状态。
 *
 * ① DSH Desktop 应用（打包快照的 DSH 运行时版本）
 * ② DSH 官方（deepseek-ai/deepseek-harness：本地 git HEAD + 官方 master / npm 最新版）
 * ③ dsh-web-ui 插件（复用插件自带的 /api/update/status：npm registry 对比 + 自动升级）
 *
 * 全部为只读探测（除了插件层主动触发的升级），失败时对应项标记为 unavailable，
 * 不影响其他层。
 */

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const OFFICIAL_REPO = 'https://github.com/deepseek-ai/deepseek-harness.git'
const NPM_REGISTRY = 'https://registry.npmjs.org'
const DSH_NPM_NAME = '@deepseek-ai/dsh'

/** 本地 DSH 仓库默认路径（开发态）。 */
const DEFAULT_REPO_DIR = path.join(process.env.HOME || '', 'dev', 'deepseek-harness')

/** 运行 10s 超时的 execFile 封装，返回 stdout 或 null。 */
function run(cmd, args, cwd) {
  return new Promise(resolve => {
    execFile(cmd, args, { cwd, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim())
    })
  })
}

/** 读一个 JSON 文件的 version 字段（文件缺失/损坏返回 null）。 */
function readVersion(pkgJsonPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/** npm registry 查询某包最新版本（失败返回 null）。 */
async function npmLatest(name) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`, { signal: controller.signal })
      if (!res.ok) return null
      const body = await res.json()
      return typeof body.version === 'string' ? body.version : null
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/** 找到 DSH 运行时目录：优先 DSH_DESKTOP_RUNTIME_DIR，其次 resources/dsh-runtime。 */
function runtimeDir() {
  if (process.env.DSH_DESKTOP_RUNTIME_DIR && fs.existsSync(process.env.DSH_DESKTOP_RUNTIME_DIR)) {
    return process.env.DSH_DESKTOP_RUNTIME_DIR
  }
  if (process.env.DSH_DESKTOP_RESOURCES) {
    const p = path.join(process.env.DSH_DESKTOP_RESOURCES, 'dsh-runtime')
    if (fs.existsSync(p)) return p
  }
  return null
}

/** 本地 DSH 仓库目录：DSH_REPO 环境变量或默认路径。 */
function repoDir() {
  return process.env.DSH_REPO || DEFAULT_REPO_DIR
}

/** 应用内嵌 runtime 的版本（apps/cli/package.json，含 lib 布局）。 */
function bundledDshVersion() {
  const dir = runtimeDir()
  if (!dir) return null
  return (
    readVersion(path.join(dir, 'apps', 'cli', 'package.json')) ||
    readVersion(path.join(dir, 'package.json'))
  )
}

/** ① 应用层：打包快照版本 + npm 上的官方最新版本。 */
async function checkApp() {
  const current = bundledDshVersion()
  const latest = await npmLatest(DSH_NPM_NAME)
  return {
    key: 'app',
    label: 'DSH Desktop 应用',
    current,
    latest,
    outdated: current != null && latest != null && latest !== current,
    // 应用本体无法自动升级：npm 包只是 CLI 快照，桌面端需要重新打包。
    actionable: false,
  }
}

/** ② 官方层：本地 git HEAD + 官方 master（git 可用时），以及 npm 最新版。 */
async function checkOfficial() {
  const dir = repoDir()
  const hasGit = fs.existsSync(path.join(dir, '.git'))
  let localHead = null
  let remoteHead = null
  if (hasGit) {
    localHead = await run('git', ['rev-parse', 'HEAD'], dir)
    // 只读探测远程，不 fetch（避免任何写操作）
    const lsRemote = await run('git', ['ls-remote', OFFICIAL_REPO, 'refs/heads/master'], dir)
    if (lsRemote) remoteHead = lsRemote.split(/\s+/)[0] || null
  }
  const latest = await npmLatest(DSH_NPM_NAME)
  const current = bundledDshVersion()
  return {
    key: 'official',
    label: 'DSH 官方（deepseek-harness）',
    current: current || localHead,
    latest,
    // 官方 master 与本地 HEAD 不一致即落后
    outdated: (localHead != null && remoteHead != null && localHead !== remoteHead) ||
      (current != null && latest != null && latest !== current),
    localHead,
    remoteHead,
    hasRepo: hasGit,
    // 官方升级 = 重新打包，无法自动完成；给指引即可
    actionable: false,
  }
}

/** ③ 插件层：请求运行中后端的 /api/update/status（loopback 信任围栏放行）。 */
async function checkPlugins(baseUrl) {
  if (!baseUrl) return { key: 'plugins', label: 'dsh-web-ui 插件', unavailable: true, reason: '后端未运行' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${baseUrl}/api/update/status`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) return { key: 'plugins', label: 'dsh-web-ui 插件', unavailable: true, reason: `状态接口 ${res.status}` }
      const body = await res.json()
      if (!body || body.mode === 'missing') {
        return { key: 'plugins', label: 'dsh-web-ui 插件', unavailable: true, reason: '插件未安装' }
      }
      return {
        key: 'plugins',
        label: 'dsh-web-ui 插件',
        mode: body.mode, // npm | link
        profileName: body.profileName,
        anchor: body.anchor,
        packages: Array.isArray(body.packages) ? body.packages : [],
        outdated: Boolean(body.outdated),
        current: body.packages && body.packages.length ? body.packages[0].current : null,
        latest: body.packages && body.packages.length ? body.packages[0].latest : null,
        actionable: body.mode === 'npm',
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { key: 'plugins', label: 'dsh-web-ui 插件', unavailable: true, reason: '无法连接后端' }
  }
}

/** 触发插件层升级：POST /api/update/run（loopback 围栏放行；仅 npm 模式可升级）。 */
async function runPluginUpdate(baseUrl) {
  if (!baseUrl) return { ok: false, error: '后端未运行' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120000)
    try {
      const res = await fetch(`${baseUrl}/api/update/run`, { method: 'POST', signal: controller.signal })
      const body = await res.json().catch(() => ({}))
      return { ok: res.ok, ...(typeof body === 'object' && body !== null ? body : {}) }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/** 聚合三层状态。 */
async function checkAll(baseUrl) {
  const [app, official, plugins] = await Promise.all([
    checkApp(),
    checkOfficial(),
    checkPlugins(baseUrl),
  ])
  return { checkedAt: new Date().toISOString(), app, official, plugins }
}

module.exports = { checkAll, runPluginUpdate, OFFICIAL_REPO }
