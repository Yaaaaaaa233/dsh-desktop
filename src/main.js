/**
 * DSH Desktop 主进程：启动 DSH web 后端 → 在 Electron 窗口里加载其 UI，
 * 并把外观设置（主题色 / 背景 / 自定义 CSS）实时注入页面。
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeImage, Notification } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const { startBackend, resolveBackendPaths, defaultRepoDir } = require('./backend')
const { detectOtherInstances, isOwnershipErrorLine } = require('./coexist')
const { DEFAULTS, load: loadSettings, save: saveSettings, mergeSettings } = require('./settings')
const { buildCss } = require('./styles')
const { checkAll, runPluginUpdate, OFFICIAL_REPO } = require('./updater')

// ── 应用基础 ────────────────────────────────────────────────────────────────

app.setName('DSH Desktop')

// 打包态资源根：backend.js 从这里找捆绑的 dsh-runtime 与 node
if (process.resourcesPath && !process.env.DSH_DESKTOP_RESOURCES) {
  process.env.DSH_DESKTOP_RESOURCES = process.resourcesPath
}

const userData = app.getPath('userData')
const settingsFile = path.join(userData, 'settings.json')
const logFile = path.join(userData, 'backend.log')

function log(kind, msg) {
  const line = `[${new Date().toISOString()}] [${kind}] ${msg}`
  console.log(line)
  try { fs.appendFileSync(logFile, line + '\n') } catch { /* 日志失败不影响运行 */ }
}

// ── 运行时准备：打包态首次启动解压内置 dsh-runtime ─────────────────────────

const { execFile } = require('node:child_process')

/**
 * 定位后端运行时目录：
 * 1. 开发态：DSH 仓库（backend.js 默认路径）；
 * 2. 打包态旧布局：Resources/dsh-runtime 目录；
 * 3. 打包态：Resources/dsh-runtime.tar.gz → 解压到 userData/dsh-runtime（只解一次）。
 * 结果写入 DSH_DESKTOP_RUNTIME_DIR，供 backend.js 使用。
 */
async function ensureRuntime() {
  const resources = process.resourcesPath

  const dirInResources = path.join(resources, 'dsh-runtime')
  if (fs.existsSync(path.join(dirInResources, 'lib', 'bin.js'))) {
    process.env.DSH_DESKTOP_RUNTIME_DIR = dirInResources
    log('boot', `使用内置运行时目录：${dirInResources}`)
    return
  }

  const archive = path.join(resources, 'dsh-runtime.tar.gz')
  if (fs.existsSync(archive)) {
    const dest = path.join(userData, 'dsh-runtime')
    const marker = dest + '.ok'
    const stat = fs.statSync(archive)
    const expected = `${stat.size}-${stat.mtimeMs}`
    let needExtract = true
    try { needExtract = fs.readFileSync(marker, 'utf8') !== expected } catch { /* 首次启动 */ }
    if (needExtract) {
      log('boot', `首次启动：解压内置 DSH 运行时（${(stat.size / 1048576).toFixed(0)}MB）…`)
      fs.rmSync(dest, { recursive: true, force: true })
      fs.mkdirSync(dest, { recursive: true })
      await new Promise((resolve, reject) => {
        execFile('/usr/bin/tar', ['-xzf', archive, '-C', dest], { maxBuffer: 1 << 30 }, err => {
          if (err) reject(new Error(`运行时解压失败：${err.message}`))
          else resolve()
        })
      })
      fs.writeFileSync(marker, expected)
      log('boot', '运行时解压完成')
    } else {
      log('boot', '使用已解压的运行时')
    }
    process.env.DSH_DESKTOP_RUNTIME_DIR = dest
    return
  }

  log('boot', `未找到内置运行时，回退到 DSH 仓库：${defaultRepoDir()}`)
}

// ── 状态 ────────────────────────────────────────────────────────────────────

const state = {
  mainWindow: null,
  panelWindow: null,
  updaterWindow: null,
  backend: null, // { stop, child }
  url: null,
  settings: loadSettings(settingsFile),
  cssKeys: [],
}

// ── 背景图 → data URL（缩放，避免 file:// 跨源限制与超大体积） ──────────────

function imageToDataUrl(p) {
  if (!p || !fs.existsSync(p)) return ''
  try {
    const img = nativeImage.createFromPath(p)
    if (img.isEmpty()) return ''
    const { width } = img.getSize()
    const out = width > 1920 ? img.resize({ width: 1920 }) : img
    const ext = path.extname(p).toLowerCase()
    return ['.jpg', '.jpeg', '.webp'].includes(ext) ? out.toJPEG(85) : out.toDataURL()
  } catch (err) {
    log('styles', `背景图转换失败：${err.message}`)
    return ''
  }
}

// ── 外观样式注入 ─────────────────────────────────────────────────────────────

async function applyStyles() {
  const win = state.mainWindow
  if (!win || win.isDestroyed()) return
  const wc = win.webContents
  for (const key of state.cssKeys) {
    try { await wc.removeInsertedCSS(key) } catch { /* 页面可能已导航 */ }
  }
  state.cssKeys = []

  let imageDataUrl = ''
  if (state.settings.background.kind === 'image' && state.settings.background.imagePath) {
    imageDataUrl = imageToDataUrl(state.settings.background.imagePath)
    if (!imageDataUrl) log('styles', `背景图加载失败：${state.settings.background.imagePath}`)
  }
  const css = buildCss(state.settings, imageDataUrl)
  if (css) {
    try {
      const key = await wc.insertCSS(css)
      state.cssKeys.push(key)
    } catch (err) {
      log('styles', `CSS 注入失败：${err.message}`)
    }
  }
  if (state.panelWindow && !state.panelWindow.isDestroyed()) {
    state.panelWindow.webContents.send('settings:applied')
  }
}

// ── 多实例共存感知 ──────────────────────────────────────────────────────────

/** 本实例将使用的数据目录（与 backend.js 的回退逻辑一致：DSH_HOME 缺省为 ~/.dsh）。 */
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** 弹系统通知（best-effort）：不支持通知或失败时只记日志，绝不影响启动。 */
function notify(title, body) {
  try {
    if (!Notification.isSupported()) {
      log('notify', `系统不支持通知，仅记日志：${title} — ${body}`)
      return
    }
    new Notification({ title, body }).show()
  } catch (err) {
    log('notify', `通知失败：${err.message}`)
  }
}

/**
 * 启动后端前检测共用同一数据目录的其他 DSH 实例（此时自己还没有后端子进程）。
 * 检测到多个合并成一条通知；任何失败只记日志，不影响启动。
 */
function detectCoexistingInstances() {
  try {
    const others = detectOtherInstances({ home: dshHome(), excludePids: [] })
    if (!others.length) return
    const pids = others.map(o => o.pid).join('、')
    log('boot', `检测到另一个 DSH 实例共用数据目录 ${dshHome()}：PID ${pids}`)
    notify(
      '检测到另一个 DSH 实例',
      `另一实例（PID ${pids}）正在使用同一数据目录。同时打开同一会话时会提示"会话已占用"，这是防止两个实例写坏会话日志的保护机制。`,
    )
  } catch (err) {
    log('boot', `共存检测失败（忽略）：${err.message}`)
  }
}

/** 会话占用错误通知节流：60 秒内最多弹一条。 */
const OWNERSHIP_NOTIFY_INTERVAL_MS = 60 * 1000
let lastOwnershipNotifyAt = 0

/** 会话占用错误人话化：命中错误行时节流弹通知；不影响日志记录。 */
function maybeNotifyOwnershipError(line) {
  try {
    if (!isOwnershipErrorLine(line)) return
    const now = Date.now()
    if (now - lastOwnershipNotifyAt < OWNERSHIP_NOTIFY_INTERVAL_MS) return
    lastOwnershipNotifyAt = now
    notify(
      '会话已被其他实例占用',
      '该会话已在另一个 DSH 实例中打开。关闭另一实例后可继续写入；此机制用于防止两个实例同时写坏会话日志。',
    )
  } catch { /* 通知失败不影响日志与启动 */ }
}

// ── DSH 后端生命周期 ────────────────────────────────────────────────────────

async function bootBackend() {
  log('boot', `启动 DSH 后端（repoDir=${repoDir()}）`)
  detectCoexistingInstances() // 启动后端前先看是否有别的实例共用数据目录
  const { url, stop, child } = await startBackend({
    repoDir: repoDir(),
    dshHome: process.env.DSH_HOME,
    port: 0,
    onLog: (kind, line) => {
      const text = line.trimEnd()
      log(kind, text)
      maybeNotifyOwnershipError(text) // 会话占用错误人话化（节流；日志照旧写）
    },
  })
  state.backend = { stop, child }
  state.url = url
  log('boot', `后端就绪：${url}`)
  return url
}

function repoDir() {
  return process.env.DSH_REPO || defaultRepoDir()
}

function watchBackendExit() {
  const child = state.backend && state.backend.child
  if (!child) return
  child.on('exit', (code, signal) => {
    if (!state.backend || state.backend.child !== child) return // 已在重启/退出流程中
    log('backend', `后端意外退出 code=${code} signal=${signal}`)
    state.backend = null
    state.url = null
    const win = state.mainWindow
    if (win && !win.isDestroyed()) {
      const msg = encodeURIComponent(`DSH 后端已退出（code=${code}）。\n\n可通过「视图 → 重启 DSH 后端」重新启动。\n\n日志：${logFile}`)
      win.loadURL(`data:text/html;charset=utf-8,${msg}`)
    }
  })
}

async function restartBackend() {
  if (state.backend) {
    const b = state.backend
    state.backend = null
    state.url = null
    await b.stop()
  }
  try {
    const url = await bootBackend()
    watchBackendExit()
    const win = state.mainWindow
    if (win && !win.isDestroyed()) win.loadURL(url)
    else createMainWindow(url)
  } catch (err) {
    log('boot', `重启失败：${err.message}`)
    dialog.showErrorBox('DSH Desktop', `DSH 后端重启失败：\n\n${err.message}`)
  }
}

// ── 窗口 ─────────────────────────────────────────────────────────────────────

/** 冒烟测试模式：DSH_DESKTOP_SMOKE=1 时隐藏窗口，加载成功后打印标记并自动退出。 */
const SMOKE = Boolean(process.env.DSH_DESKTOP_SMOKE)

/** 主窗口固定标题：不随网页/对话标题变化。 */
const WINDOW_TITLE = 'DSH desktop'

function createMainWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: !SMOKE,
    title: WINDOW_TITLE,
    backgroundColor: '#0d1221',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.setMenuBarVisibility(false)
  // 网页 <title> 会随所选对话标题变化；阻止它改窗口标题，固定为应用名。
  win.on('page-title-updated', (event) => {
    event.preventDefault()
    win.setTitle(WINDOW_TITLE)
  })
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('http://') || u.startsWith('https://')) shell.openExternal(u)
    return { action: 'deny' }
  })
  win.on('closed', () => { state.mainWindow = null })
  win.webContents.on('did-finish-load', async () => {
    await applyStyles()
    if (SMOKE) {
      log('smoke', `页面加载完成：${win.webContents.getURL()} title=${win.webContents.getTitle()}`)
      app.exit(0)
    }
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    if (SMOKE) {
      log('smoke', `页面加载失败：${code} ${desc}`)
      app.exit(1)
    }
  })
  state.mainWindow = win
  if (url) win.loadURL(url)
  else win.loadURL(LOADING_PAGE)
  return win
}

/** 后端就绪前的加载页（深色 + 居中提示，避免启动白屏）。 */
const LOADING_PAGE = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0;background:#0d1221;color:#9aa3b5;
    font:14px -apple-system,'PingFang SC',sans-serif;display:flex;align-items:center;justify-content:center}
  .box{text-align:center}.spin{width:28px;height:28px;margin:0 auto 14px;border:3px solid #2c3547;
    border-top-color:#4176e6;border-radius:50%;animation:r 0.9s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
</style></head><body><div class="box"><div class="spin"></div>正在启动 DSH 后端…</div></body></html>`)

// ── 外观设置面板 ────────────────────────────────────────────────────────────

function openPanel() {
  if (state.panelWindow && !state.panelWindow.isDestroyed()) {
    state.panelWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 500,
    height: 720,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    title: '外观设置',
    backgroundColor: '#151a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, 'panel', 'settings.html'))
  win.on('closed', () => { state.panelWindow = null })
  state.panelWindow = win
}

/** 检查更新面板（独立无边框浮窗，复用 settings 面板样式体系）。 */
function openUpdaterPanel() {
  if (state.updaterWindow && !state.updaterWindow.isDestroyed()) {
    state.updaterWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    fullscreenable: false,
    title: '检查更新',
    backgroundColor: '#151a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, 'panel', 'updater.html'))
  win.on('closed', () => { state.updaterWindow = null })
  state.updaterWindow = win
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => state.settings)

ipcMain.handle('settings:set', async (_e, patch) => {
  state.settings = mergeSettings(state.settings, patch)
  saveSettings(settingsFile, state.settings)
  await applyStyles()
  return state.settings
})

ipcMain.handle('settings:reset', async () => {
  state.settings = mergeSettings(DEFAULTS, {})
  saveSettings(settingsFile, state.settings)
  await applyStyles()
  return state.settings
})

ipcMain.handle('settings:pickImage', async () => {
  const parent = state.panelWindow && !state.panelWindow.isDestroyed() ? state.panelWindow : state.mainWindow
  const r = await dialog.showOpenDialog(parent, {
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  })
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
})

ipcMain.handle('app:restartBackend', () => restartBackend())
ipcMain.handle('app:openInBrowser', () => { if (state.url) shell.openExternal(state.url) })
ipcMain.handle('app:quit', () => app.quit())
ipcMain.handle('app:getStatus', () => ({
  url: state.url,
  repoDir: repoDir(),
  built: (() => { try { resolveBackendPaths(repoDir()); return true } catch { return false } })(),
}))

// ── 检查更新 IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('updater:check', () => checkAll(state.url))
ipcMain.handle('updater:runPluginUpdate', () => runPluginUpdate(state.url))
ipcMain.handle('updater:openOfficialRepo', () => shell.openExternal(OFFICIAL_REPO))

// ── 菜单 ─────────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '外观设置…', accelerator: 'CmdOrCtrl+Shift+B', click: () => openPanel() },
        { label: '检查更新…', accelerator: 'CmdOrCtrl+Shift+U', click: () => openUpdaterPanel() },
        { label: '重启 DSH 后端', click: () => restartBackend() },
        { label: '在浏览器中打开', click: () => state.url && shell.openExternal(state.url) },
        { type: 'separator' },
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: '窗口', role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── 生命周期 ─────────────────────────────────────────────────────────────────

let quitting = false
app.on('before-quit', e => {
  if (quitting) return
  const b = state.backend
  if (b) {
    e.preventDefault()
    quitting = true
    b.stop().finally(() => { state.backend = null; app.quit() })
  }
})

app.on('window-all-closed', () => app.quit())

app.on('activate', () => {
  if (!state.mainWindow && state.url) createMainWindow(state.url)
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore()
      state.mainWindow.show()
      state.mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    buildMenu()
    createMainWindow() // 先显示加载页，后端就绪后换载真实 URL
    try {
      await ensureRuntime()
      const url = await bootBackend()
      watchBackendExit()
      const win = state.mainWindow
      if (win && !win.isDestroyed()) win.loadURL(url)
      else createMainWindow(url)
    } catch (err) {
      log('boot', `启动失败：${err.message}`)
      dialog.showErrorBox('DSH Desktop 启动失败', err.message)
      app.quit()
    }
  })
}
