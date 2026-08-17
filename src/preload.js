/**
 * 设置面板 preload：通过 contextBridge 暴露最小 IPC 面。
 * 仅用于外观设置面板窗口；主窗口不加载 preload。
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshPanel', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: patch => ipcRenderer.invoke('settings:set', patch),
  reset: () => ipcRenderer.invoke('settings:reset'),
  pickImage: () => ipcRenderer.invoke('settings:pickImage'),
  restartBackend: () => ipcRenderer.invoke('app:restartBackend'),
  openInBrowser: () => ipcRenderer.invoke('app:openInBrowser'),
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onApplied: cb => ipcRenderer.on('settings:applied', () => cb()),
  // 检查更新面板
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  runPluginUpdate: () => ipcRenderer.invoke('updater:runPluginUpdate'),
  openOfficialRepo: () => ipcRenderer.invoke('updater:openOfficialRepo'),
})
