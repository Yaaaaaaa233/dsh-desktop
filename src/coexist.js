/**
 * 多实例共存感知：
 * 1. detectOtherInstances —— 找出共用同一数据目录的其他 DSH 实例（`dsh web` 进程）；
 * 2. isOwnershipErrorLine —— 识别"会话已被其他实例占用"错误日志行（内核 per-session flock 拒绝写）。
 * 纯 Node 模块，可单独测试；所有外部命令均为 best-effort，绝不抛出。
 */

const { execFileSync } = require('node:child_process')
const os = require('node:os')
const { join } = require('node:path')

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 所有外部命令统一超时（毫秒）。 */
const EXEC_TIMEOUT = 5000
/** 最多读取环境的候选进程数（避免极端情况下的 ps eww 风暴）。 */
const MAX_CANDIDATES = 20

// ── 进程探测 ────────────────────────────────────────────────────────────────

/** `dsh web` 进程形态：/path/to/node /path/to/lib/bin.js web …，命令行同时含 bin.js 与 web。 */
function isWebProcess(command) {
  return /bin\.js\b/.test(command) && /\bweb\b/.test(command)
}

/** 从 `ps eww <pid>` 输出里解析 DSH_HOME；无 DSH_HOME（或为空）视为默认 ~/.dsh。 */
function parseDshHome(psOutput) {
  const m = /(?:^|\s)DSH_HOME=([^\s]*)/.exec(psOutput)
  return m && m[1] ? m[1] : join(os.homedir(), '.dsh')
}

/**
 * 找出共用同一数据目录的其他 DSH 实例。
 * @param {object} opts
 * @param {string} opts.home 本实例将使用的数据目录（process.env.DSH_HOME || ~/.dsh）
 * @param {number[]} [opts.excludePids] 需排除的 pid（调用方自己的后端子进程等）
 * @returns {{pid: number, command: string, home: string}[]} best-effort：任何一步失败静默跳过，绝不抛出
 */
function detectOtherInstances({ home, excludePids = [] } = {}) {
  const found = []
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: EXEC_TIMEOUT })
    const exclude = new Set(excludePids.map(Number))
    const candidates = []
    for (const raw of out.split('\n')) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(raw)
      if (!m) continue
      const pid = Number(m[1])
      const command = m[2].trim()
      if (!isWebProcess(command)) continue
      if (exclude.has(pid)) continue
      candidates.push({ pid, command })
      if (candidates.length >= MAX_CANDIDATES) break
    }
    for (const c of candidates) {
      try {
        const env = execFileSync('ps', ['eww', String(c.pid)], { encoding: 'utf8', timeout: EXEC_TIMEOUT })
        const instanceHome = parseDshHome(env)
        if (instanceHome === home) found.push({ pid: c.pid, command: c.command, home: instanceHome })
      } catch { /* 进程可能刚退出，静默跳过 */ }
    }
  } catch { /* ps 失败视为未发现其他实例 */ }
  return found
}

// ── 会话占用错误识别 ────────────────────────────────────────────────────────

/** 内核 ≥ 0.1.5-rc.2 的 SessionAlreadyOwnedError（per-session flock 拒绝写）。 */
const OWNERSHIP_ERROR_RE = /SessionAlreadyOwnedError|already owned by an active write handle/

/** 该日志行是否为"会话已被其他实例占用"错误。 */
function isOwnershipErrorLine(line) {
  return typeof line === 'string' && OWNERSHIP_ERROR_RE.test(line)
}

module.exports = { detectOtherInstances, isOwnershipErrorLine }
