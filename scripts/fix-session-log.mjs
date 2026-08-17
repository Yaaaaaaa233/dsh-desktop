/**
 * 会话日志修复（v4，供独立 agent 在 DSH 完全退出后执行）。
 *
 * v3 的教训：把 header + 全部事件明文压成「单个 zstd 帧」写回，
 * 而读取器要求第一帧必须恰好是一行 header（session-persistence-jsonl
 * 的 assertZstdHeaderFrame），且每个完整帧内不得有跨帧断裂的记录。
 * v4 改为保留 .bak 的原始帧边界：逐帧解码明文 → 在含重复行的帧内删除
 * 该行 → 逐帧重新压缩 → 顺序拼接原子写回。帧边界结构与正常写入器一致。
 *
 * 背景（已诊断，勿重跑分析）：
 * - session-19035fd0 的日志 seq 334938 重复（agent/inbox/spliced 与
 *   session/end-seed 撞号，原始并发写冲突——两个 DSH 实例同时写同一会话）。
 * - 13:34 的当前文件被活跃后端继续写入 3 分钟，产生更多不可恢复的损坏
 *   （L12965 粘连、seq 378035 真缺失），已放弃；改用 13:31 的 .bak。
 * - 修复 = 用 .bak 恢复（逐帧），仅删除重复行 → 378,036 事件严格连续。
 *
 * 安全设计：
 * 1. 前置检查：DSH 后端运行中（3080 等端口）或日志被进程打开 → 拒绝执行；
 * 2. 备份：损坏的当前文件先复制为 *.singleframe（保留 v3 误修证据），
 *    *.broken 保留原始损坏证据，.bak 保留不动；
 * 3. 原子写回：写 .tmp 后 rename；
 * 4. 校验：header 帧恰好一行 + 每帧以换行结尾（无断裂记录）+ seq 严格
 *    0..N-1 连续，否则回滚到 *.broken。
 *
 * 用法：node fix-session-log.mjs
 * 依赖：node 24、repo 编译产物（路径硬编码）。
 */
import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const zstdMod = await import('/Users/yea/dev/deepseek-harness/packages/session/session-persistence-jsonl/lib/types/zstd.js')
const coreMod = await import('/Users/yea/dev/deepseek-harness/packages/core/session/lib/types/index.js')
const { createZstdFrameDecoder, compressZstdFrame, scanZstdFrames } = zstdMod
const { decodeStorageRecord } = coreMod

const HOME = process.env.HOME || ''
const dir = join(HOME, '.dsh', 'sessions', '--Users-yea-Documents-DSH--', 'session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16')
const logPath = join(dir, 'session.jsonl.zstd')
const bakPath = join(dir, 'session.jsonl.zstd.bak')
const brokenPath = join(dir, 'session.jsonl.zstd.broken')
const singleFramePath = join(dir, 'session.jsonl.zstd.singleframe')

// ── 0. 前置检查 ─────────────────────────────────────────────────────────────
function preflight() {
  const problems = []
  for (const port of [3080, 65128, 59262, 3101, 3102]) {
    try {
      const out = execFileSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
      if (out.trim()) problems.push(`端口 ${port} 有进程监听（DSH 后端正在运行）`)
    } catch { /* 无监听 */ }
  }
  for (const p of [logPath, bakPath]) {
    try {
      const out = execFileSync('/usr/sbin/lsof', [p], { encoding: 'utf8' })
      if (out.trim()) problems.push(`${p} 被进程打开`)
    } catch { /* 未被打开 */ }
  }
  if (problems.length) {
    console.error('❌ 前置检查未通过，拒绝修复：')
    for (const p of problems) console.error('   - ' + p)
    console.error('请先完全退出所有 DSH 实例（DSH Desktop.app 与 dsh web），再运行本脚本。')
    process.exit(2)
  }
  console.log('✅ 前置检查通过：无 DSH 后端运行，日志未被占用')
}

// ── 帧工具 ──────────────────────────────────────────────────────────────────
function decodeFrames(buf) {
  const scan = scanZstdFrames(buf)
  const decoder = createZstdFrameDecoder()
  const frames = []
  try {
    for (const plain of decoder.decode(buf, scan.frames)) frames.push(Buffer.from(plain))
  } finally {
    decoder.close()
  }
  return { frames, scan }
}

/** 在单个帧的明文中删除内容匹配（seq + type）的行，返回新明文或 null。 */
function dropMatchingLineFromFrame(frameBuf, targetSeq, targetType) {
  const text = frameBuf.toString('utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l) continue
    let evs = null
    try { evs = decodeStorageRecord(JSON.parse(l)) } catch { continue }
    if (evs.some(ev => ev && ev.seq === targetSeq && ev.type === targetType)) {
      console.log(`删除重复行 L${i}: ${targetType}:${targetSeq}`)
      return [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n')
    }
  }
  return null
}

/** 强校验：header 帧恰好一行 + 每帧以换行结尾 + seq 严格连续。 */
function verify(buf) {
  const { frames } = decodeFrames(buf)
  if (frames.length === 0) return { ok: false, reason: '无帧' }
  const header = frames[0]
  const headerOk = header.length > 0 && header.indexOf(0x0A) === header.length - 1
  let count = 0
  let br = null
  let torn = null
  for (let f = 1; f < frames.length; f++) {
    const p = frames[f]
    if (p.length === 0 || p[p.length - 1] !== 0x0A) {
      torn ??= `帧 ${f} 不以换行结尾（含断裂记录）`
      continue
    }
    const lines = p.toString('utf8').split('\n')
    for (let i = 0; i < lines.length - 1; i++) {
      const l = lines[i].trim()
      if (!l) continue
      let evs = null
      try { evs = decodeStorageRecord(JSON.parse(l)) } catch { /* 留 null */ }
      if (evs === null) {
        if (br === null) br = { expected: count, got: `unparsable@帧${f}行${i}` }
        continue
      }
      for (const ev of evs) {
        if (ev && typeof ev.seq === 'number') {
          if (count !== ev.seq && br === null) br = { expected: count, got: ev.seq }
          count++
        }
      }
    }
  }
  return { ok: headerOk && torn === null && br === null, eventCount: count, frameCount: frames.length, headerOk, torn, br }
}

// ── main ───────────────────────────────────────────────────────────────────
preflight()

if (!existsSync(bakPath)) { console.error('❌ 缺少备份 .bak，拒绝操作（无可靠基线）'); process.exit(1) }
if (!existsSync(logPath)) { console.error('❌ 日志不存在: ' + logPath); process.exit(1) }

console.log(`日志: ${logPath} (${statSync(logPath).size} bytes)`)
console.log(`备份: ${bakPath} (${statSync(bakPath).size} bytes)`)

// 0) 解码 .bak，逐帧保留明文
const { frames: bakFrames, scan: bakScan } = decodeFrames(readFileSync(bakPath))
console.log(`.bak 解码: ${bakFrames.length} 帧`)

// 1) 备份当前损坏文件（v3 误修为单帧）为 *.singleframe（保留证据）
if (!existsSync(singleFramePath)) {
  copyFileSync(logPath, singleFramePath)
  console.log(`v3 误修的单帧文件已备份为: ${singleFramePath}`)
}

// 2) 逐帧删除重复行（seq 334938 的 agent/inbox/spliced）
let removed = false
const fixedFrames = []
for (let i = 0; i < bakFrames.length; i++) {
  let plain = bakFrames[i]
  if (i === 0) {
    fixedFrames.push(plain)
    continue
  }
  if (!removed) {
    const fixed = dropMatchingLineFromFrame(plain, 334938, 'agent/inbox/spliced')
    if (fixed !== null) { removed = true; plain = Buffer.from(fixed, 'utf8') }
  }
  if (plain.length > 0) fixedFrames.push(plain)
}
if (!removed) {
  console.error('❌ 未在 .bak 中找到待删行: agent/inbox/spliced:334938')
  process.exit(1)
}

// 3) 逐帧重新压缩 → 顺序拼接 → 原子写回
const outParts = []
for (const plain of fixedFrames) outParts.push(await compressZstdFrame(plain))
const newBuf = Buffer.concat(outParts)
const tmpPath = logPath + '.tmp'
writeFileSync(tmpPath, newBuf)
renameSync(tmpPath, logPath)
console.log(`已写回: ${logPath} (${newBuf.length} bytes, ${fixedFrames.length} 帧)`)

// 4) 校验
const check = verify(readFileSync(logPath))
if (!check.ok) {
  console.error(`❌ 校验失败：headerOk=${check.headerOk} torn=${check.torn ?? '-'} 断点 ${JSON.stringify(check.br)} — 回滚`)
  renameSync(brokenPath, logPath)
  process.exit(1)
}
console.log(`✅ 修复完成并校验通过：${check.eventCount} 个事件，seq 严格连续 0..${check.eventCount - 1}，${check.frameCount} 帧，header 帧结构正确`)
console.log('现在可以重新打开 DSH（桌面版或标准版）加载历史。')
console.log('注意：原始损坏证据保留在 session.jsonl.zstd.broken，v3 误修证据保留在 session.jsonl.zstd.singleframe，确认无误后可删除。')