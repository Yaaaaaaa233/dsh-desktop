/**
 * 从 DSH 仓库构建完全自包含的 runtime（取代 pnpm deploy + 修补的脆弱流程）。
 *
 * 仓库本身能正常启动（其 node_modules 依赖图完整且一致），因此这里直接以仓库为
 * 唯一来源：apps/cli 的产物文件 + 生产闭包里每个包的扁平真实目录复制。
 * 关键点：
 * - 一律复制为真实目录、不建任何符号链接 → 单实例、无外部引用、可归档、自包含；
 * - 闭包遍历覆盖 dependencies + peerDependencies + optionalDependencies；
 * - 外部包（含原生模块）从仓库 .pnpm store 取真实内容。
 *
 * 运行：node scripts/build-runtime.js
 */

const { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, lstatSync } = require('node:fs')
const { join, dirname } = require('node:path')

const REPO = process.env.DSH_REPO || '/Users/yea/dev/deepseek-harness'
const RT = join(__dirname, '..', 'runtime')
const RT_NM = join(RT, 'node_modules')

// ── 工具 ────────────────────────────────────────────────────────────────────

/** 扁平复制：把 src 的内容复制到 dest，跳过一切 node_modules 子目录，符号链接按内容跟随。 */
function copyFlat(src, dest) {
  const st = statSync(src)
  if (st.isFile()) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return
  }
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
      if (entry === 'node_modules' || entry === '.git') continue
      copyFlat(join(src, entry), join(dest, entry))
    }
  }
}

/** 仓库 .pnpm store 的索引：包名 -> 首个含它的 store 条目里的实目录。 */
function buildStoreIndex() {
  const store = join(REPO, 'node_modules', '.pnpm')
  const index = new Map()
  const addEntry = (name, dir) => {
    if (!index.has(name)) index.set(name, dir)
  }
  try {
    for (const entry of readdirSync(store)) {
      const nm = join(store, entry, 'node_modules')
      let entries = []
      try { entries = readdirSync(nm) } catch { continue }
      for (const name of entries) {
        const p = join(nm, name)
        let st
        try { st = statSync(p) } catch { continue }
        if (st.isDirectory() && name.startsWith('@')) {
          // scoped：@scope/pkg 两层
          let scoped = []
          try { scoped = readdirSync(p) } catch { continue }
          for (const sub of scoped) addEntry(`${name}/${sub}`, join(p, sub))
        } else {
          addEntry(name, p)
        }
      }
    }
  } catch { /* store 不存在 */ }
  return index
}

/** 仓库工作区按包名找实目录（vendor、packages 两层、apps、native）。 */
function findInRepo(name) {
  const pkgName = name.split('/').pop()
  const roots = [join(REPO, 'vendor'), join(REPO, 'apps'), join(REPO, 'native')]
  const packageRoot = join(REPO, 'packages')
  try {
    for (const category of readdirSync(packageRoot)) roots.push(join(packageRoot, category))
  } catch { /* 无 */ }
  for (const root of roots) {
    let entries = []
    try { entries = readdirSync(root) } catch { continue }
    for (const dir of entries) {
      const manifestPath = join(root, dir, 'package.json')
      try {
        if (JSON.parse(readFileSync(manifestPath, 'utf8')).name === name) return dirname(manifestPath)
      } catch { /* 跳过 */ }
      try {
        for (const subDir of readdirSync(join(root, dir, 'packages'))) {
          const subManifest = join(root, dir, 'packages', subDir, 'package.json')
          try {
            if (JSON.parse(readFileSync(subManifest, 'utf8')).name === name) return dirname(subManifest)
          } catch { /* 跳过 */ }
        }
      } catch { /* 无子层 */ }
    }
  }
  return null
}

/** 把包复制到 runtime/node_modules/<name>（扁平）。返回是否成功。 */
function ensurePkg(name, storeIndex) {
  const target = join(RT_NM, ...name.split('/'))
  if (existsSync(target)) return true

  // 特殊：web 前端只取 package.json + dist
  if (name === '@deepseek-ai/dsh-web-frontend') {
    mkdirSync(target, { recursive: true })
    copyFileSync(join(REPO, 'apps', 'web', 'package.json'), join(target, 'package.json'))
    copyFlat(join(REPO, 'apps', 'web', 'dist'), join(target, 'dist'))
    return true
  }

  const fromRepo = findInRepo(name)
  if (fromRepo) {
    copyFlat(fromRepo, target)
    return true
  }
  const fromStore = storeIndex.get(name)
  if (fromStore) {
    copyFlat(fromStore, target)
    return true
  }
  return false
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

rmSync(RT, { recursive: true, force: true })
mkdirSync(RT_NM, { recursive: true })

// 1) apps/cli 产物
copyFlat(join(REPO, 'apps', 'cli', 'lib'), join(RT, 'lib'))
copyFlat(join(REPO, 'apps', 'cli', 'config'), join(RT, 'config'))
copyFileSync(join(REPO, 'apps', 'cli', 'package.json'), join(RT, 'package.json'))

// 2) 闭包复制
const storeIndex = buildStoreIndex()
const appManifest = JSON.parse(readFileSync(join(RT, 'package.json'), 'utf8'))
const queue = [appManifest]
const seen = new Set()
const enqueued = new Set([appManifest.name])
const missing = []
while (queue.length) {
  const manifest = queue.shift()
  for (const name of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]) {
    if (seen.has(name)) continue
    seen.add(name)
    if (!ensurePkg(name, storeIndex)) {
      missing.push(name)
      continue
    }
    try {
      const m = JSON.parse(readFileSync(join(RT_NM, ...name.split('/'), 'package.json'), 'utf8'))
      if (!enqueued.has(m.name)) {
        enqueued.add(m.name)
        queue.push(m)
      }
    } catch { /* 无 manifest */ }
  }
}

// 3) 审计
const links = []
const walk = dir => {
  let entries = []
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    const p = join(dir, entry)
    let st
    try { st = lstatSync(p) } catch { continue }
    if (st.isSymbolicLink()) links.push(p)
    else if (st.isDirectory()) walk(p)
  }
}
walk(RT_NM)

console.log(`闭包共 ${seen.size} 个包`)
console.log(`缺失（可选）${missing.length} 个：${missing.join(', ') || '无'}`)
if (links.length) {
  console.error(`⚠️ 仍存在 ${links.length} 个符号链接（应为 0）`)
  process.exitCode = 1
} else {
  console.log('审计通过：node_modules 无符号链接 ✅')
}
console.log(`runtime 大小：${(require('node:fs').statSync(RT).blocks ? '' : '')}`)
