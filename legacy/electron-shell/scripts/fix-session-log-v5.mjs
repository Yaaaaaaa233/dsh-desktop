/**
 * v5 修复：resume 语义错误 "invalid persisted inbox splice at session seq 334940"。
 *
 * 根因：seq 334938 有两个撞号事件（13:20:07 session/end-seed 与 13:20:37
 * agent/inbox/spliced，双后端并发写入）。v4 删掉了 spliced（插入用户消息），
 * 导致 334940 的删除型 splice 在重放时对空表执行 → Inbox 构造失败。
 * 正确选择：删 end-seed（日志中还有 5 个，仅 compaction 区域检测消费，
 * 本会话 compaction 区间已闭合，无影响），保留 spliced。
 *
 * 构成：.bak 逐帧（删 end-seed:334938 行，空帧跳过）+ .fixed 最后一帧
 * （13:46 DSH 合成的 turn17 中断收尾 3 事件）。
 *
 * 已通过只读模拟：seq 0..378038 严格连续；全日志 66 个 inbox splice 重放
 * 全部有效（模拟器对当前文件复现 334940 报错，证明仿真忠实）。
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO = process.env.DSH_REPO || join(homedir(), 'dev', 'deepseek-harness')
const zstdMod = await import(pathToFileURL(join(REPO, 'packages/session/session-persistence-jsonl/lib/types/zstd.js')).href)
const coreMod = await import(pathToFileURL(join(REPO, 'packages/core/session/lib/types/index.js')).href)
const { createZstdFrameDecoder, compressZstdFrame, scanZstdFrames } = zstdMod
const { decodeStorageRecord } = coreMod

const dir = join(process.env.HOME, '.dsh', 'sessions', '--Users-yea-Documents-DSH--', 'session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16')
const logPath = join(dir, 'session.jsonl.zstd')
const bakPath = join(dir, 'session.jsonl.zstd.bak')
const fixedPath = join(dir, 'session.jsonl.zstd.fixed')

function preflight() {
  const problems = []
  for (const port of [3080, 65128, 59262, 3101, 3102]) {
    try {
      const out = execFileSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
      if (out.trim()) problems.push(`端口 ${port} 有进程监听（DSH 正在运行）`)
    } catch { /* 无监听 */ }
  }
  try {
    const out = execFileSync('/usr/sbin/lsof', [logPath], { encoding: 'utf8' })
    if (out.trim()) problems.push('日志文件被进程打开')
  } catch { /* 未占用 */ }
  if (problems.length) {
    console.error('❌ 前置检查未通过：\n' + problems.map(p => '   - ' + p).join('\n'))
    process.exit(2)
  }
  console.log('✅ 前置检查通过')
}

async function loadFrames(p) {
  const buf = readFileSync(p)
  const { frames } = scanZstdFrames(buf)
  const dec = createZstdFrameDecoder()
  const plains = []
  try { for (const v of dec.decode(buf, frames)) plains.push(Buffer.from(v)) } finally { dec.close() }
  return plains
}

function framesToEvents(plains) {
  let header = null
  const events = []
  for (const t of plains.map(b => b.toString('utf8'))) {
    for (const l of t.split('\n').slice(0, -1)) {
      if (!l.trim()) continue
      const parsed = JSON.parse(l)
      if (header === null && parsed.type === 'session') { header = parsed; continue }
      for (const ev of decodeStorageRecord(parsed)) events.push(ev)
    }
  }
  return { header, events }
}

function simulateInbox(header, events) {
  const state = { 'next-turn': [], 'next-step': [] }
  let spliceCount = 0
  for (const ev of events.slice(header.seedLength ?? 0)) {
    if (ev.type !== 'agent/inbox/spliced') continue
    spliceCount++
    const sp = ev.data
    const inbox = state[sp.target]
    const start = sp.start
    const rc = sp.removedCount ?? 0
    if (!Number.isSafeInteger(start) || start < 0 || start > inbox.length
      || !Number.isSafeInteger(rc) || rc < 0 || start + rc > inbox.length) {
      return { ok: false, seq: ev.seq, err: 'invalid inbox splice' }
    }
    const candidate = inbox.toSpliced(start, rc, ...(sp.inserted || []))
    const ids = new Set()
    for (const m of sp.target === 'next-turn' ? [...candidate, ...state['next-step']] : [...state['next-turn'], ...candidate]) {
      if (ids.has(m.id)) return { ok: false, seq: ev.seq, err: `message "${m.id}" is already pending` }
      ids.add(m.id)
    }
    inbox.splice(start, rc, ...(sp.inserted || []))
  }
  return { ok: true, spliceCount, pendingTurn: state['next-turn'].length, pendingStep: state['next-step'].length }
}

function verify(plains, label) {
  const h = plains[0]
  const headerOk = h.length > 0 && h.indexOf(0x0A) === h.length - 1
  let torn = null
  for (let f = 1; f < plains.length; f++) {
    if (plains[f].length === 0 || plains[f][plains[f].length - 1] !== 0x0A) { torn ??= f; break }
  }
  const { header, events } = framesToEvents(plains)
  let br = null
  events.forEach((e, i) => { if (e.seq !== i && br === null) br = { i, seq: e.seq } })
  const inbox = simulateInbox(header, events)
  const ok = headerOk && torn === null && br === null && inbox.ok
  console.log(`[${label}] frames=${plains.length} events=${events.length} headerOk=${headerOk} torn=${torn ?? '-'} seqBreak=${br ? JSON.stringify(br) : '无'} inbox=${JSON.stringify(inbox)}`)
  return ok
}

preflight()
if (!existsSync(bakPath) || !existsSync(fixedPath)) { console.error('❌ 缺少 .bak 或 .fixed'); process.exit(1) }

const bakFrames = await loadFrames(bakPath)
const fixedFrames = await loadFrames(fixedPath)

const candFrames = []
let removed = false
for (let i = 0; i < bakFrames.length; i++) {
  let t = bakFrames[i].toString('utf8')
  if (i > 0 && !removed) {
    const lines = t.split('\n')
    for (let j = 0; j < lines.length - 1; j++) {
      const l = lines[j].trim()
      if (!l) continue
      try {
        const evs = decodeStorageRecord(JSON.parse(l))
        if (evs.some(e => e.seq === 334938 && e.type === 'session/end-seed')) {
          lines.splice(j, 1)
          t = lines.join('\n')
          removed = true
          console.log(`已删除 .bak 帧${i} 中的 end-seed:334938`)
          break
        }
      } catch { /* skip */ }
    }
  }
  const buf = Buffer.from(t, 'utf8')
  if (buf.length > 0) candFrames.push(buf)
}
if (!removed) { console.error('❌ 未找到 end-seed:334938，中止'); process.exit(1) }
candFrames.push(Buffer.from(fixedFrames[fixedFrames.length - 1].toString('utf8'), 'utf8'))
console.log(`v5 候选: ${candFrames.length} 帧（.bak 去行 + .fixed 尾帧 3 事件）`)

if (!verify(candFrames, '候选(内存)')) { console.error('❌ 候选校验失败，不写入'); process.exit(1) }

const parts = []
for (const plain of candFrames) parts.push(await compressZstdFrame(plain))
const tmpPath = logPath + '.tmp'
writeFileSync(tmpPath, Buffer.concat(parts))
renameSync(tmpPath, logPath)
console.log(`已原子写回 ${logPath}`)

const diskFrames = await loadFrames(logPath)
if (!verify(diskFrames, '写回后(磁盘)')) { console.error('❌ 磁盘校验失败！'); process.exit(1) }
console.log('✅ v5 修复完成：结构 / seq 连续 / Inbox 全量重放 均通过')
console.log('现在可以重新打开 DSH 并 resume 该会话。')