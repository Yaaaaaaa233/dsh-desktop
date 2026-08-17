/**
 * 检查更新面板逻辑：加载三层更新状态、渲染徽章与详情，支持插件层升级。
 */

const $ = id => document.getElementById(id)

const els = {
  close: $('btn-close'),
  refresh: $('btn-refresh'),
  summary: $('summary'),
  app: {
    card: $('card-app'),
    current: $('app-current'),
    latest: $('app-latest'),
    badge: $('app-badge'),
    detail: $('app-detail'),
  },
  official: {
    card: $('card-official'),
    current: $('official-current'),
    latest: $('official-latest'),
    badge: $('official-badge'),
    detail: $('official-detail'),
  },
  plugins: {
    card: $('card-plugins'),
    current: $('plugins-current'),
    latest: $('plugins-latest'),
    badge: $('plugins-badge'),
    detail: $('plugins-detail'),
    updateBtn: $('btn-plugins-update'),
  },
  browser: $('btn-browser'),
  restart: $('btn-restart'),
  status: $('status'),
}

function shortHash(h) {
  return h && h.length > 7 ? h.slice(0, 7) : h || '—'
}

function badge(text, kind) {
  return `<span class="badge ${kind || ''}">${text}</span>`
}

function renderItem(entry, el) {
  // entry: { current, latest, outdated, unavailable, reason, detailHtml, badgeText, badgeKind }
  el.current.textContent = entry.current || '—'
  el.latest.textContent = entry.latest || '—'
  el.badge.textContent = entry.badgeText
  el.badge.className = 'badge ' + (entry.badgeKind || '')
  el.detail.innerHTML = entry.detailHtml || ''
}

function render(result) {
  const { app, official, plugins } = result

  // ── ① 应用层 ──
  if (app.unavailable) {
    renderItem({ current: '—', latest: '—', badgeText: '不可用', badgeKind: 'err',
      detailHtml: app.reason ? `无法读取：${escapeHtml(app.reason)}` : '无法读取版本信息' }, els.app)
  } else {
    renderItem({
      current: app.current, latest: app.latest,
      badgeText: app.outdated ? '有更新' : '已最新',
      badgeKind: app.outdated ? 'warn' : 'ok',
      detailHtml: app.outdated
        ? `打包快照 <code>${app.current}</code> 落后于官方 npm 发布 <code>${app.latest}</code>。<br>应用本体无法自动升级：需要重新打包安装新版。`
        : `打包快照 <code>${app.current}</code> 已是官方 npm 最新版本。`,
    }, els.app)
  }

  // ── ② 官方层 ──
  if (official.unavailable) {
    renderItem({ current: '—', latest: '—', badgeText: '不可用', badgeKind: 'err',
      detailHtml: `无法读取：${escapeHtml(official.reason || '未知原因')}` }, els.official)
  } else {
    let detail
    if (official.outdated) {
      detail = `本地仓库 HEAD <code>${shortHash(official.localHead)}</code> 落后于官方 master <code>${shortHash(official.remoteHead)}</code>，`
        + `或 npm 版本 <code>${official.latest}</code> 高于当前 <code>${official.current}</code>。<br>`
        + `更新方式：<code>git pull</code> 官方仓库后重新打包。`
    } else {
      detail = `本地仓库 HEAD <code>${shortHash(official.localHead)}</code> 与官方 master 一致。`
    }
    if (!official.hasRepo) {
      detail = `未找到本地仓库（<code>${escapeHtml(official.repoDir || '')}</code>）。`
    }
    renderItem({
      current: official.current, latest: official.latest,
      badgeText: official.outdated ? '有更新' : '已最新',
      badgeKind: official.outdated ? 'warn' : 'ok',
      detailHtml: detail,
    }, els.official)
  }

  // ── ③ 插件层 ──
  if (plugins.unavailable) {
    renderItem({ current: '—', latest: '—', badgeText: '不可用', badgeKind: 'err',
      detailHtml: escapeHtml(plugins.reason || '无法读取插件状态') }, els.plugins)
    els.plugins.updateBtn.style.display = 'none'
  } else {
    const outdatedCount = (plugins.packages || []).filter(p => p.outdated).length
    renderItem({
      current: plugins.current, latest: plugins.latest,
      badgeText: plugins.outdated ? `有更新（${outdatedCount} 个包）` : '已最新',
      badgeKind: plugins.outdated ? 'warn' : 'ok',
      detailHtml: plugins.outdated
        ? `有 ${outdatedCount} 个 <code>@linxin666/*</code> 包可升级（当前 <code>${plugins.current}</code> → <code>${plugins.latest}</code>）。`
        : `${(plugins.packages || []).length} 个 <code>@linxin666/*</code> 包均为最新（<code>${plugins.current}</code>）。`
        + (plugins.mode === 'link' ? '<br>⚠️ 本地链接安装（开发模式），无法自动升级。' : ''),
    }, els.plugins)
    els.plugins.updateBtn.style.display = plugins.actionable && plugins.outdated ? 'inline-block' : 'none'
  }

  // ── 汇总 ──
  const anyOutdated = [app, official, plugins].some(x => x.outdated)
  const anyUnavailable = [app, official, plugins].some(x => x.unavailable)
  if (anyOutdated) {
    els.summary.textContent = '发现可更新的组件'
    els.summary.className = 'summary has-update'
  } else if (anyUnavailable) {
    els.summary.textContent = '部分状态不可用'
    els.summary.className = 'summary'
  } else {
    els.summary.textContent = '所有组件已是最新版本'
    els.summary.className = 'summary all-latest'
  }
  els.status.textContent = `检查于 ${new Date(result.checkedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function refresh() {
  els.summary.textContent = '正在检查更新…'
  els.summary.className = 'summary'
  els.status.textContent = '检查中…'
  try {
    const result = await window.dshPanel.checkUpdates()
    render(result)
  } catch (err) {
    els.summary.textContent = '检查失败'
    els.summary.className = 'summary'
    els.status.textContent = err.message || String(err)
  }
}

async function upgradePlugins() {
  const btn = els.plugins.updateBtn
  btn.disabled = true
  btn.textContent = '升级中…'
  els.plugins.detail.textContent = '正在升级插件（pnpm update），可能需要一两分钟…'
  try {
    const r = await window.dshPanel.runPluginUpdate()
    if (r && r.ok) {
      els.plugins.detail.innerHTML = '✅ 升级完成。请点击下方「重启后端」使新版本生效。'
      els.status.textContent = '升级完成'
    } else {
      els.plugins.detail.innerHTML = `⚠️ 升级未成功：${escapeHtml((r && (r.error || r.reason)) || '未知原因')}`
      els.status.textContent = '升级失败'
    }
  } catch (err) {
    els.plugins.detail.innerHTML = `⚠️ 升级失败：${escapeHtml(err.message || String(err))}`
  } finally {
    btn.disabled = false
    btn.textContent = '升级插件'
  }
}

els.close.addEventListener('click', () => window.close())
els.refresh.addEventListener('click', refresh)
els.plugins.updateBtn.addEventListener('click', upgradePlugins)
els.browser.addEventListener('click', () => window.dshPanel.openOfficialRepo())
els.restart.addEventListener('click', () => window.dshPanel.restartBackend())

refresh()
