/**
 * DSH 后端进程管理：以 OS 分配的端口启动 `dsh web`，解析其打印的 URL，
 * 并提供停止/重启。纯 Node 模块，不依赖 Electron，可单独测试。
 *
 * Node 运行时选择：DSH 的 loader 依赖 Node >= 24 的内部模块解析（node 22 下
 * 无法从 vendor/loader 解析工作区包，会启动失败），因此派生的必须是 Node >= 24。
 * 打包态优先使用应用内捆绑的 node（Resources/node/bin/node），开发态取 PATH
 * 里的 node；均可用 DSH_NODE 环境变量覆盖。
 */

const { spawn, execFileSync } = require('node:child_process')
const readline = require('node:readline')
const { existsSync } = require('node:fs')
const { join, delimiter } = require('node:path')
const os = require('node:os')
const net = require('node:net')

/** 匹配 dsh web 打印的 URL 行，例如 `dsh web: http://127.0.0.1:61487`。 */
const URL_LINE_RE = /dsh web:\s*(https?:\/\/\S+)/i

const BOOT_TIMEOUT_MS = 60_000
const MIN_NODE_MAJOR = 24

/**
 * 优先使用的固定端口。浏览器 localStorage 按“源”（含端口）隔离：若每次启动
 * 都用随机端口，自建皮肤等前端本地数据就会因源变化而在重启后丢失。桌面端
 * 优先固定该端口让重启保持同源；仅当端口被占用时才退回随机端口。
 */
const PREFERRED_PORT = 32091

/** 返回 preferred（若空闲）或 0（回退到系统随机分配）。 */
function pickPreferredPort(preferred) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(0))
    server.listen(preferred, '127.0.0.1', () => {
      server.close(() => resolve(preferred))
    })
  })
}

/** 默认 DSH 仓库位置；可用 DSH_REPO 环境变量覆盖。 */
function defaultRepoDir() {
  if (process.env.DSH_REPO) return process.env.DSH_REPO
  // 打包态：主进程解压后的运行时目录（main.js ensureRuntime 设置）
  if (process.env.DSH_DESKTOP_RUNTIME_DIR) return process.env.DSH_DESKTOP_RUNTIME_DIR
  // 打包态（旧布局）：应用内直接捆绑的 dsh-runtime 目录
  const resources = process.env.DSH_DESKTOP_RESOURCES
  if (resources) {
    const bundled = join(resources, 'dsh-runtime')
    if (existsSync(bundled)) return bundled
  }
  return join(os.homedir(), 'dev', 'deepseek-harness')
}

/**
 * 解析用于派生后端的 Node 可执行文件，并校验版本 >= 24。
 * 优先级：DSH_NODE 环境变量 → 打包态捆绑的 node → PATH 里的 node。
 * @returns {string} node 可执行文件路径
 */
function resolveNodeBin() {
  let bin = process.env.DSH_NODE
  if (!bin) {
    const resources = process.env.DSH_DESKTOP_RESOURCES
    if (resources) {
      const bundled = join(resources, 'node', 'bin', 'node')
      if (existsSync(bundled)) bin = bundled
    }
  }
  if (!bin) bin = 'node'
  let version = ''
  try {
    version = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim()
  } catch (err) {
    throw new Error(
      `找不到 Node 可执行文件：${bin}（${err.message}）\n` +
      'DSH Desktop 需要系统 Node >= 24（可用 DSH_NODE 环境变量指定，例如 DSH_NODE=/opt/homebrew/bin/node）。',
    )
  }
  const m = version.match(/^v(\d+)\./)
  if (!m || Number(m[1]) < MIN_NODE_MAJOR) {
    throw new Error(
      `Node 版本过低：${bin} = ${version}，需要 >= ${MIN_NODE_MAJOR}（DSH 的 loader 依赖 Node ${MIN_NODE_MAJOR}+ 的内部模块解析）。`,
    )
  }
  return bin
}

/**
 * 校验后端产物是否齐备，返回 { bin, distIndex } 或抛出带中文提示的错误。
 * 同时支持两种布局：
 * - 仓库布局：<repo>/apps/cli/lib/bin.js + <repo>/apps/web/dist/index.html
 * - 打包布局（pnpm deploy）：<runtime>/node_modules/@deepseek-ai/dsh/lib/bin.js
 *   + <runtime>/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html
 */
function resolveBackendPaths(repoDir = defaultRepoDir()) {
  const layouts = [
    { bin: join(repoDir, 'apps', 'cli', 'lib', 'bin.js'), distIndex: join(repoDir, 'apps', 'web', 'dist', 'index.html') },
    {
      bin: join(repoDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      distIndex: join(repoDir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'),
    },
    {
      // pnpm deploy 布局：CLI 包内容平铺在 runtime 根（lib/ + package.json），前端在 node_modules 里
      bin: join(repoDir, 'lib', 'bin.js'),
      distIndex: join(repoDir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html'),
    },
  ]
  const missing = []
  for (const layout of layouts) {
    if (existsSync(layout.bin) && existsSync(layout.distIndex)) return layout
    if (!existsSync(layout.bin)) missing.push(layout.bin)
  }
  const err = new Error(
    `缺少 DSH 后端/前端构建产物：\n${missing.join('\n')}\n\n` +
    '请先确保 DSH 仓库已构建（pnpm run build），或应用内 dsh-runtime 完好。',
  )
  err.code = 'DSH_NOT_BUILT'
  throw err
}

/**
 * 启动 DSH web 后端并等待其打印 URL。
 * @param {object} opts
 * @param {string} [opts.repoDir] DSH 仓库根目录（默认 ~/dev/deepseek-harness，可用 DSH_REPO 覆盖）
 * @param {string} [opts.dshHome] 可选，覆盖 $DSH_HOME；留空则用系统默认 ~/.dsh
 * @param {number} [opts.port] 监听端口；0 表示由系统分配（推荐，避免冲突）
 * @param {(kind:'out'|'err', line:string)=>void} [opts.onLog]
 * @returns {Promise<{url:string, stop:()=>Promise<void>, child:import('node:child_process').ChildProcess}>}
 */
/**
 * 给子进程 PATH 补上常见用户 bin 目录（存在才加）。
 *
 * 桌面端由 Electron（Finder 启动的 GUI 进程）拉起，不会继承用户 shell 的
 * PATH，导致后端 spawn `pnpm`/`corepack`/`npx` 时找不到（~/config/pnpm、
 * ~/.npm-global、/opt/homebrew 等）。这里显式把这些目录并入 PATH，
 * 让 dsh-web-ui 的检查更新/升级等需要 pnpm 的操作在桌面端可用。
 */
function enrichedPath() {
  const home = process.env.HOME || ''
  const candidates = [
    join(home, '.npm-global', 'bin'),
    join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const existing = candidates.filter((p) => existsSync(p))
  const current = process.env.PATH || ''
  const parts = current.split(delimiter).filter(Boolean)
  // 前缀优先，确保这些目录在 PATH 最前；去重
  const merged = [...existing, ...parts]
  return [...new Set(merged)].join(delimiter)
}

async function startBackend({ repoDir = defaultRepoDir(), dshHome, port = 0, onLog = () => {} } = {}) {
  const { bin } = resolveBackendPaths(repoDir)
  const nodeBin = resolveNodeBin()
  const env = { ...process.env }
  env.PATH = enrichedPath()
  if (dshHome) env.DSH_HOME = dshHome
  else delete env.DSH_HOME // 显式回退到系统默认 ~/.dsh

  // 未显式指定端口时，优先固定端口（保持同源以持久化前端 localStorage），
  // 端口被占则退回 0（随机分配）。
  let effectivePort = port
  if (effectivePort === 0) effectivePort = await pickPreferredPort(PREFERRED_PORT)

  const child = spawn(nodeBin, [bin, 'web', '--port', String(effectivePort)], {
    cwd: repoDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let settled = false
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const t = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 4000)
    child.once('exit', () => { clearTimeout(t); resolve() })
    child.kill('SIGTERM')
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`DSH 后端 ${BOOT_TIMEOUT_MS / 1000}s 内未就绪，请查看日志`))
      }
    }, BOOT_TIMEOUT_MS)

    const rl = readline.createInterface({ input: child.stdout })
    rl.on('line', line => {
      onLog('out', line)
      const m = line.match(URL_LINE_RE)
      if (m && !settled) {
        settled = true
        clearTimeout(timer)
        resolve({ url: m[1], stop, child })
      }
    })
    child.stderr.on('data', chunk => {
      onLog('err', String(chunk))
    })
    child.on('error', err => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })
    child.on('exit', (code, signal) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`DSH 后端在打印 URL 前退出（code=${code} signal=${signal}）`))
      }
    })
  })
}

module.exports = { startBackend, resolveBackendPaths, resolveNodeBin, defaultRepoDir, URL_LINE_RE, MIN_NODE_MAJOR }
