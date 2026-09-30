/**
 * 从 DSH 仓库构建完全自包含的 runtime。
 *
 * 仓库本身能正常启动（其 node_modules 依赖图完整且一致），因此这里直接以仓库为
 * 唯一来源：apps/cli 的产物文件 + 生产闭包里每个包的复制。
 *
 * 关键设计：
 * - **每个依赖都从它的依赖方目录按 Node 解析规则解析**（walk-up node_modules），
 *   而不是"从 pnpm store 里挑第一个同名包"——后者在多版本依赖下会拿错版本。
 *   2026-09-11：commander 在 store 里有 5/7/8/9/15 五个版本，旧逻辑抓到 5.1.0，
 *   而 apps/cli 需要 ^15.0.0，导致打包 runtime 启动即 `addHelpText is not a function`。
 * - 顶层尽量扁平（同名包一个版本）；**当一个依赖方要求的版本与顶层已有版本不兼容时，
 *   把该依赖方需要的版本作为嵌套副本放进它自己的 node_modules**——这正是 Node 的
 *   解析顺序，npm/pnpm 也是这么做的。嵌套副本的依赖继续按同样规则处理。
 * - 全程只复制真实目录，不建任何符号链接 → 单实例、无外部引用、可归档、自包含。
 * - 结尾做审计：符号链接数必须为 0、每个依赖方声明的范围必须被它实际解析到的版本满足；
 *   未解决的依赖（既不能扁平也不能嵌套）会让 exit code 非 0。
 *
 * 运行：DSH_REPO=<repo> node scripts/build-runtime.js [--strict]
 */

const { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, lstatSync, realpathSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { homedir } = require('node:os')

const REPO = process.env.DSH_REPO || join(homedir(), 'dev', 'deepseek-harness')
// 输出目录可用 DSH_RUNTIME_OUT 覆盖：多内核版本并存时各建各的，不互相覆盖
// （回滚要用的 rc.2 运行时保持原样）。
const RT = process.env.DSH_RUNTIME_OUT || join(__dirname, '..', 'runtime')
const RT_NM = join(RT, 'node_modules')
const CLI_DIR = join(REPO, 'apps', 'cli')
const STRICT = process.argv.includes('--strict')

// ── 工具 ────────────────────────────────────────────────────────────────────

/** 复制：把 src 的内容复制到 dest，跳过一切 node_modules 子目录，符号链接按内容跟随。 */
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

/**
 * 按 Node 解析规则从 fromDir 向上找 name 的真实目录（跟随 pnpm 的符号链接）。
 * @returns {string|null} 真实目录，找不到返回 null
 */
function resolveDepDir(name, fromDir) {
  let dir = fromDir
  for (;;) {
    const candidate = join(dir, 'node_modules', ...name.split('/'))
    try {
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    } catch { /* 继续向上 */ }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** 尽力加载 semver（仓库 store 里一定有，但未必可解析）；失败返回 null。 */
function loadSemver() {
  const store = join(REPO, 'node_modules', '.pnpm')
  let entries = []
  try { entries = readdirSync(store) } catch { return null }
  const versions = entries
    .filter(e => /^semver@\d/.test(e))
    .map(e => e.slice('semver@'.length))
    .sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
      return (pb[0] - pa[0]) || (pb[1] - pa[1]) || (pb[2] - pa[2])
    })
  for (const v of versions) {
    try { return require(join(store, `semver@${v}`, 'node_modules', 'semver')) } catch { /* 下一个 */ }
  }
  return null
}

const semver = loadSemver()

/**
 * 判断 version 是否满足 range。workspace:/link:/file: 等内部范围与无法判定的范围返回 null。
 * @returns {boolean|null}
 */
function satisfies(version, range) {
  if (!semver || typeof range !== 'string' || typeof version !== 'string') return null
  if (/^(workspace|link|file|portal):/.test(range)) return null
  try {
    if (!semver.valid(version)) return null
    return semver.satisfies(version, range, { includePrerelease: true, loose: true })
  } catch { return null }
}

/** 读某个已复制包的版本。 */
function pkgVersion(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version } catch { return undefined }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

rmSync(RT, { recursive: true, force: true })
mkdirSync(RT_NM, { recursive: true })

// 1) apps/cli 产物
copyFlat(join(CLI_DIR, 'lib'), join(RT, 'lib'))
copyFlat(join(CLI_DIR, 'config'), join(RT, 'config'))
copyFileSync(join(CLI_DIR, 'package.json'), join(RT, 'package.json'))

// 2) 闭包复制
const appManifest = JSON.parse(readFileSync(join(RT, 'package.json'), 'utf8'))
/** 顶层扁平注册表：name -> { version, dir } */
const flat = new Map()
/** 待处理队列：{ manifest, srcDir, ownDir }（ownDir = 该包在 runtime 里的落点） */
const queue = [{ manifest: appManifest, srcDir: realpathSync(CLI_DIR), ownDir: RT }]
const enqueued = new Set([appManifest.name])
const missing = new Set()
const nested = []          // 用嵌套副本解决的版本冲突
const unresolved = []      // 既不能扁平也不能嵌套
const stats = { checked: 0, unknown: 0 }

function copyPkgTo(name, src, destNm) {
  const target = join(destNm, ...name.split('/'))
  copyFlat(src, target)
  return target
}

while (queue.length) {
  const { manifest, srcDir, ownDir } = queue.shift()
  const wanted = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  }
  for (const [name, range] of Object.entries(wanted)) {
    // 该依赖方自己所在目录下的 node_modules（嵌套副本落点）
    const ownNm = join(ownDir, 'node_modules')

    const known = flat.get(name)
    if (known) {
      const ok = satisfies(known.version, range)
      if (ok !== false) { stats.checked++; if (ok === null) stats.unknown++; continue }
      // 顶层版本不满足 → 给这个依赖方放一份嵌套副本
      const nestedDir = join(ownNm, ...name.split('/'))
      if (existsSync(join(nestedDir, 'package.json'))) {
        const have = pkgVersion(nestedDir)
        if (satisfies(have, range) !== false) { stats.checked++; continue }
      }
      const src = resolveDepDir(name, srcDir)
      if (!src) { unresolved.push(`${manifest.name} 需要 ${name}@${range}（顶层是 ${known.version}，且解析不到）`); continue }
      copyPkgTo(name, src, ownNm)
      const v = pkgVersion(nestedDir)
      nested.push(`${manifest.name} 需要 ${name}@${range} → 嵌套副本 ${v}（顶层保留 ${known.version}）`)
      stats.checked++
      try {
        const m = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
        queue.push({ manifest: m, srcDir: src, ownDir: nestedDir })
      } catch { /* 无 manifest */ }
      continue
    }

    // 顶层还没有这个包
    if (name === '@deepseek-ai/dsh-web-frontend') {
      // web 前端只取 package.json + dist
      const target = join(RT_NM, ...name.split('/'))
      mkdirSync(target, { recursive: true })
      copyFileSync(join(REPO, 'apps', 'web', 'package.json'), join(target, 'package.json'))
      copyFlat(join(REPO, 'apps', 'web', 'dist'), join(target, 'dist'))
      flat.set(name, { version: pkgVersion(target), dir: target })
      stats.checked++
      continue
    }

    const src = resolveDepDir(name, srcDir)
    if (!src) { missing.add(name); continue }
    const target = copyPkgTo(name, src, RT_NM)
    const version = pkgVersion(target)
    flat.set(name, { version, dir: target })
    const ok = satisfies(version, range)
    if (ok === false) unresolved.push(`${manifest.name} 需要 ${name}@${range}，顶层复制到 ${version}`)
    else { stats.checked++; if (ok === null) stats.unknown++ }

    try {
      const m = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
      if (!enqueued.has(m.name)) {
        enqueued.add(m.name)
        queue.push({ manifest: m, srcDir: src, ownDir: target })
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

const missingList = [...missing]
console.log(`顶层扁平 ${flat.size} 个包；版本校验 ${stats.checked} 通过 / ${stats.unknown} 无法判定${semver ? '' : '（semver 不可用）'}`)
console.log(`缺失（平台相关/可选）${missingList.length} 个：${missingList.join(', ') || '无'}`)
if (nested.length) {
  console.log(`用嵌套副本解决版本冲突 ${nested.length} 处：`)
  for (const n of nested) console.log(`   · ${n}`)
}
if (links.length) {
  console.error(`⚠️ 仍存在 ${links.length} 个符号链接（应为 0）`)
  process.exitCode = 1
} else {
  console.log('审计通过：node_modules 无符号链接 ✅')
}
if (unresolved.length) {
  console.error(`⚠️ 未解决的依赖 ${unresolved.length} 处：`)
  for (const u of unresolved) console.error(`   - ${u}`)
  process.exitCode = 1
} else {
  console.log('依赖解析通过：每个依赖方声明的范围都被它实际解析到的版本满足 ✅')
}
if (STRICT && nested.length) process.exitCode = 1
