/**
 * 修复 pnpm deploy --legacy 的缺失链接：确保 runtime/node_modules 顶层存在
 * 生产闭包里的每个包（@deepseek-ai/* 与外部依赖），缺的从 runtime 自身的
 * .pnpm store 里建符号链接；store 里也没有的（工作区包）从仓库 packages/ 复制。
 * 运行：node scripts/repair-runtime.js
 */

const { readFileSync, existsSync, cpSync, symlinkSync, readdirSync } = require('node:fs')
const { join, dirname, basename } = require('node:path')

const REPO = process.env.DSH_REPO || '/Users/yea/dev/deepseek-harness'
const RT = join(__dirname, '..', 'runtime')
const RT_NM = join(RT, 'node_modules')
const RT_STORE = join(RT_NM, '.pnpm')

const appManifest = JSON.parse(readFileSync(join(RT, 'package.json'), 'utf8'))

/** 在 runtime store 里查找 name 的实目录（任意版本）。 */
function findInStore(name) {
  try {
    for (const entry of readdirSync(RT_STORE)) {
      const cand = join(RT_STORE, entry, 'node_modules', name)
      if (existsSync(cand)) return cand
    }
  } catch { /* store 不存在 */ }
  return null
}

/** 在仓库工作区里按包名找实目录（覆盖 vendor、packages 两层、apps、native）。 */
function findInRepo(name) {
  const pkgName = name.split('/').pop()
  const roots = [join(REPO, 'vendor'), join(REPO, 'apps'), join(REPO, 'native')]
  const packageRoot = join(REPO, 'packages')
  try {
    for (const category of readdirSync(packageRoot)) {
      roots.push(join(packageRoot, category))
    }
  } catch { /* packages 不存在 */ }
  for (const root of roots) {
    let entries = []
    try { entries = readdirSync(root) } catch { continue }
    for (const dir of entries) {
      const manifestPath = join(root, dir, 'package.json')
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (m.name === name) return dirname(manifestPath)
      } catch { /* 跳过 */ }
      // native/* 下还有一层 packages/*
      try {
        const sub = join(root, dir, 'packages')
        for (const subDir of readdirSync(sub)) {
          const subManifest = join(sub, subDir, 'package.json')
          try {
            const m = JSON.parse(readFileSync(subManifest, 'utf8'))
            if (m.name === name) return dirname(subManifest)
          } catch { /* 跳过 */ }
        }
      } catch { /* 无子层 */ }
    }
  }
  return null
}

/** 确保顶层存在 name（优先符号链接到 store，失败则复制），返回其目录或 null。 */
function ensureTopLevel(name) {
  const target = join(RT_NM, ...name.split('/'))
  if (existsSync(target)) return target
  const fromStore = findInStore(name)
  if (fromStore) {
    try {
      symlinkSync(fromStore, target, 'dir')
      return target
    } catch (err) {
      console.log(`[链接失败，改为复制] ${name}（${err.code}）`)
      try {
        copyWithoutNodeModules(fromStore, target)
        return target
      } catch { /* 继续走仓库复制 */ }
    }
  }
  const fromRepo = findInRepo(name)
  if (fromRepo) {
    console.log(`[复制] ${name} <- ${fromRepo}`)
    copyWithoutNodeModules(fromRepo, target)
    return target
  }
  return null
}

/**
 * 复制包目录到 target，但剔除内部 node_modules。
 * 源 node_modules 里的 pnpm 符号链接在仓库环境指向仓库 store；直接复制会带进
 * 指向仓库的绝对链接，导致运行时同一依赖出现两个实例（scope 机制失灵、persona
 * 落进全局层）。去掉后依赖统一向上解析到 runtime 顶层 node_modules，单一实例。
 */
function copyWithoutNodeModules(src, target) {
  const { cpSync, rmSync } = require('node:fs')
  const sep = require('node:path').sep
  cpSync(src, target, {
    recursive: true,
    dereference: false,
    filter: p => !p.split(sep).includes('node_modules'),
  })
  try { rmSync(join(target, 'node_modules'), { recursive: true, force: true }) } catch { /* 不存在 */ }
}

/**
 * 审计：runtime/node_modules 下不允许任何逃出 runtime 根的符号链接
 * （即解析后不在 runtime 目录内——通常是指向仓库 store 的绝对链接）。
 * 返回违规列表。
 */
function auditExternalLinks() {
  const { lstatSync, readlinkSync, realpathSync } = require('node:fs')
  const rtReal = realpathSync(RT)
  const bad = []
  const walk = dir => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      const p = join(dir, entry)
      let st
      try { st = lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) {
        try {
          const resolved = realpathSync(p)
          if (!resolved.startsWith(rtReal + require('node:path').sep)) {
            bad.push(`${p} -> ${readlinkSync(p)}`)
          }
        } catch { bad.push(`${p} -> ${readlinkSync(p)} (broken)`) }
      } else if (st.isDirectory()) {
        walk(p)
      }
    }
  }
  walk(RT_NM)
  return bad
}

// 修复 pnpm workspace overrides 带进来的外部链接（cosmokit/schemastery 指向仓库 vendor）：
// 把它们落成 runtime 内的真实目录（剔除内部 node_modules），再删除所有逃逸链接，
// 让全图解析统一落到 runtime 顶层，保证单实例。
{
  const { rmSync, lstatSync, realpathSync, unlinkSync } = require('node:fs')
  const sep = require('node:path').sep
  const OVERRIDE_PKGS = {
    '@deepseek-ai/cosmokit': join(REPO, 'vendor', 'cosmokit'),
    '@deepseek-ai/schemastery': join(REPO, 'vendor', 'schemastery'),
  }
  const rtReal = realpathSync(RT)
  for (const [name, src] of Object.entries(OVERRIDE_PKGS)) {
    const target = join(RT_NM, ...name.split('/'))
    if (existsSync(src)) {
      rmSync(target, { recursive: true, force: true })
      copyWithoutNodeModules(src, target)
      console.log(`[vendor] ${name} 已落为 runtime 内真实目录`)
    }
  }
  // 删除所有解析后逃出 runtime 根的符号链接
  let removed = 0
  const removeEscaping = dir => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      const p = join(dir, entry)
      let st
      try { st = lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) {
        try {
          const resolved = realpathSync(p)
          if (!resolved.startsWith(rtReal + sep)) {
            unlinkSync(p)
            removed++
          }
        } catch { /* broken */ unlinkSync(p); removed++ }
      } else if (st.isDirectory()) {
        removeEscaping(p)
      }
    }
  }
  removeEscaping(RT_NM)
  if (removed) console.log(`[vendor] 已删除 ${removed} 个逃逸符号链接`)
}

// 清理既有复制品：剔除所有顶层真实目录包内部的 node_modules（旧版本可能带仓库链接）
{
  const { lstatSync } = require('node:fs')
  const cleaned = []
  const cleanDir = dir => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      const p = join(dir, entry)
      let st
      try { st = lstatSync(p) } catch { continue }
      if (st.isDirectory() && !st.isSymbolicLink()) {
        const inner = join(p, 'node_modules')
        if (existsSync(inner)) {
          require('node:fs').rmSync(inner, { recursive: true, force: true })
          cleaned.push(p)
        }
      }
    }
  }
  cleanDir(RT_NM)
  cleanDir(join(RT_NM, '@deepseek-ai'))
  if (cleaned.length) console.log(`清理了 ${cleaned.length} 个复制品的内部 node_modules（消除仓库链接）`)
}

// BFS 生产闭包（deps + peers），从 app manifest 开始
const queue = [appManifest]
const seen = new Set()
const enqueued = new Set([appManifest.name])
while (queue.length) {
  const manifest = queue.shift()
  for (const name of [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]) {
    if (seen.has(name)) continue
    seen.add(name)
    const dir = ensureTopLevel(name)
    if (!dir) {
      console.log(`[缺失且无法修复] ${name}`)
      continue
    }
    try {
      const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (!enqueued.has(m.name)) {
        enqueued.add(m.name)
        queue.push(m)
      }
    } catch { /* 无 manifest */ }
  }
}
console.log(`\n闭包检查完成：共 ${seen.size} 个包，顶层均已就绪。`)

// ── 摊平（flatten）：所有顶层符号链接替换为真实目录复制，删除 .pnpm store ──
// pnpm deploy 产出的链接结构混杂绝对/相对/跨目录引用，tar 打包再解压后极易错位
// （曾导致同依赖双实例、persona 落全局层、addon 找不到 binding）。
// 摊平后 node_modules 无任何符号链接：单实例、自包含、可归档。
{
  const { lstatSync, realpathSync, rmSync, mkdirSync, readdirSync, copyFileSync, statSync } = require('node:fs')
  const sep = require('node:path').sep
  const copyTree = (src, dest) => {
    const st = statSync(src)
    if (st.isFile()) {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      return
    }
    if (st.isDirectory()) {
      mkdirSync(dest, { recursive: true })
      for (const e of readdirSync(src)) {
        if (e === 'node_modules') continue
        copyTree(join(src, e), join(dest, e))
      }
    }
  }
  const flattenEntry = p => {
    let st
    try { st = lstatSync(p) } catch { return }
    if (!st.isSymbolicLink()) return
    const real = realpathSync(p)
    rmSync(p, { recursive: true, force: true })
    copyTree(real, p)
    return p
  }
  let flat = 0
  for (const entry of readdirSync(RT_NM)) {
    if (entry === '.pnpm' || entry === '.bin') continue
    const p = join(RT_NM, entry)
    let st
    try { st = lstatSync(p) } catch { continue }
    // 注意：符号链接的 lstat().isDirectory() 为 false，必须显式处理符号链接
    if (entry.startsWith('@') && st.isDirectory() && !st.isSymbolicLink()) {
      for (const name of readdirSync(p)) if (flattenEntry(join(p, name))) flat++
    } else if (flattenEntry(p)) {
      flat++
    }
  }
  console.log(`[flatten] 摊平了 ${flat} 个符号链接为真实目录`)
  rmSync(RT_STORE, { recursive: true, force: true })
  console.log('[flatten] 已删除 .pnpm store')
}

// 最终审计：不允许任何指向 runtime 之外的符号链接
const bad = auditExternalLinks()
if (bad.length) {
  console.error(`\n⚠️ 发现 ${bad.length} 个指向 runtime 之外的符号链接：`)
  for (const b of bad.slice(0, 20)) console.error('  ' + b)
  process.exitCode = 1
} else {
  console.log('审计通过：node_modules 内无外部链接 ✅')
}
