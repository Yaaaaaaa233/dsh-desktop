/**
 * 会话日志损坏诊断（只读）：用 DSH 自己的解码栈逐帧解压 jsonl.zstd，
 * 通过 decodeStorageRecord 展开每一行，找到 seq 断点及其上下文。
 * 不写任何文件，只打印诊断。用法：node diag-session-log.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// repo 编译产物是 ESM；node 24 可直接 import .js（package.json 无 type:module 时按 CJS，
// 但内容含 export 语法会失败）——因此用 createRequire 无法加载 ESM。
// 改用动态 import 直接加载（node 会按内容检测 ESM 语法）。
const zstdMod = await import('/Users/yea/dev/deepseek-harness/packages/session/session-persistence-jsonl/lib/types/zstd.js')
const coreMod = await import('/Users/yea/dev/deepseek-harness/packages/core/session/lib/types/index.js')
const { createZstdFrameDecoder, scanZstdFrames } = zstdMod
const { decodeStorageRecord } = coreMod

const HOME = process.env.HOME || ''
const logPath = join(HOME, '.dsh', 'sessions', '--Users-yea-Documents-DSH--', 'session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16', 'session.jsonl.zstd')
const buf = readFileSync(logPath)
const { frames, tornStart } = scanZstdFrames(buf)
console.log(`完整帧数: ${frames.length} | tornStart: ${tornStart ?? '无'}`)

let all = ''
for (const f of frames) {
  const decoder = createZstdFrameDecoder()
  for (const plain of decoder.decode(buf, [f])) all += plain.toString('utf8')
}
console.log(`明文总字节: ${all.length}`)

const lines = all.split('\n')
let eventCount = 0
let anomaly = null
let lastTurnEndSeq = -1

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim()
  if (!line) continue
  let events
  try {
    events = decodeStorageRecord(JSON.parse(line))
  } catch (err) {
    console.log(`L${i}: JSON/解码失败: ${err.message}`)
    continue
  }
  for (const ev of events) {
    if (ev && typeof ev.seq === 'number') {
      if (ev.type === 'turn/end') lastTurnEndSeq = ev.seq
      if (eventCount !== ev.seq && anomaly === null) {
        anomaly = { line: i, expected: eventCount, got: ev.seq, type: ev.type, lastTurnEndSeq }
      }
      eventCount++
    }
  }
}

console.log(`事件总数: ${eventCount} | 最后一个 turn/end 的 seq: ${lastTurnEndSeq}`)
if (anomaly) {
  console.log(`⚠️ 异常点: 文件行 ${anomaly.line}, 期望 seq ${anomaly.expected}, 实际 seq ${anomaly.got}, 类型 ${anomaly.type}`)
  console.log(`   该断点是否在最后 committed turn 之前（是=已提交区域损坏，拒绝加载）: ${anomaly.got <= anomaly.lastTurnEndSeq}`)
  for (let j = Math.max(1, anomaly.line - 3); j <= Math.min(lines.length - 1, anomaly.line + 3); j++) {
    const l = lines[j].trim()
    let info = ''
    if (l) {
      try {
        const evs = decodeStorageRecord(JSON.parse(l))
        info = evs.map(e => `${e.type}:${e.seq}`).join(',')
      } catch { info = '<解析失败>' }
    }
    console.log(`  L${j} [${info}] ${l.slice(0, 120)}`)
  }
} else {
  console.log('✅ 全日志 seq 连续，无异常')
}
