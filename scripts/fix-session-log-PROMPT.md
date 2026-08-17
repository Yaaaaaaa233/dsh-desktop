# 任务：修复 DSH 会话日志（session-19035fd0）

你是独立的执行 agent。有一个 DSH（DeepSeek Harness）会话的日志损坏了，导致历史无法加载。请严格按下面步骤执行，**不要自行发挥**。

## 背景（已诊断完毕，无需重新分析）

- 会话 ID：`session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16`
- 日志文件：`~/.dsh/sessions/--Users-yea-Documents-DSH--/session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16/session.jsonl.zstd`
- 损坏原因：seq 334938 被写入两次（并发写冲突），DSH 校验器严格拒绝加载（错误：`seq gap in committed region at line 22080 (expected 334939, got 334938)`）
- 可用备份：`~/.dsh/sessions/--Users-yea-Documents-DSH--/session-19035fd0-5fa7-4bc1-a926-ef717a0f3e16/session.jsonl.zstd.bak`（13:31 保存，仅一个可修复问题）
- **修复方案已干跑验证通过**：用 .bak 覆盖当前文件 → 删除重复行（L22080，`agent/inbox/spliced:334938`）→ 378,036 个事件严格连续

## 关键前提（最重要！）

**执行修复前，必须确保没有任何 DSH 实例在运行**（桌面版 DSH Desktop.app、标准版 `dsh web`、任何监听 3080/65128/59262 的进程都退出）。否则修复会被活跃写入再次破坏。
- 本脚本自带前置检查，不通过会拒绝执行（退出码 2）
- 如果前置检查失败，提示用户完全退出所有 DSH 实例后再运行

## 执行步骤

```sh
# 1. 检查环境（node 版本需 >= 24）
node -v

# 2. 运行修复脚本（路径在 /Users/yea/Documents/DSH/dsh-desktop/scripts/ 下）
cd /Users/yea/Documents/DSH/dsh-desktop/scripts && node fix-session-log.mjs
```

脚本会依次：
1. 前置检查（无 DSH 后端运行、日志未被占用）
2. 验证 .bak 可修复
3. 把当前损坏文件备份为 `session.jsonl.zstd.broken`（证据保留）
4. 从 .bak 明文删除重复行（seq 334938 的 `agent/inbox/spliced`）
5. 重新压缩并原子写回 `session.jsonl.zstd`
6. 校验：seq 严格连续 0..378035 → 通过则打印 ✅；失败则自动回滚

## 成功标准

脚本输出：
```
✅ 前置检查通过：无 DSH 后端运行，日志未被占用
✅ 修复完成并校验通过：378036 个事件，seq 严格连续 0..378035
```

## 失败处理

- 前置检查失败（退出码 2）：提示用户**完全退出所有 DSH 实例**（Dock 里的 DSH Desktop 右键退出、终端里 Ctrl+C 停掉 `dsh web`），然后重跑
- 其他错误：把完整输出贴给用户，**不要**手动改文件

## 完成后

- 告诉用户修复完成，可以重新打开 DSH 加载历史
- 提醒用户：桌面版和标准版共用 `~/.dsh`，**同一时间只能开一个 DSH 实例**操作同一会话，否则会再次写坏日志
- 损坏证据在 `session.jsonl.zstd.broken`，确认历史加载正常后可删除

## 只读诊断工具（如需要）

`diag-session-log.mjs`（同目录）可只读解码日志并报告 seq 连续性，不改任何文件：
```sh
node diag-session-log.mjs
```
