/**
 * 外观设置面板逻辑：读取/写回设置，改动即时生效（防抖 250ms）。
 */

const $ = id => document.getElementById(id)

const els = {
  themeColor: $('theme-color'),
  themeReset: $('btn-theme-reset'),
  kindButtons: [...document.querySelectorAll('#bg-kind button')],
  bgColor: $('bg-color'),
  gradFrom: $('bg-grad-from'),
  gradTo: $('bg-grad-to'),
  gradAngle: $('bg-grad-angle'),
  gradAngleVal: $('grad-angle-val'),
  imagePath: $('bg-image-path'),
  pickImage: $('btn-pick-image'),
  opacity: $('bg-opacity'),
  opacityVal: $('bg-opacity-val'),
  overlay: $('bg-overlay'),
  overlayAlpha: $('bg-overlay-alpha'),
  customCss: $('custom-css'),
  resetAll: $('btn-reset-all'),
  browser: $('btn-browser'),
  restart: $('btn-restart'),
  quit: $('btn-quit'),
  close: $('btn-close'),
  status: $('status'),
}

function hexToRgba(hex, alpha) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function setKind(kind) {
  els.kindButtons.forEach(b => b.classList.toggle('active', b.dataset.kind === kind))
  document.querySelectorAll('.field').forEach(f => {
    const show = f.dataset.show
    f.style.display = show === kind ? 'flex' : 'none'
  })
}

function populate(s) {
  els.themeColor.value = /^#[0-9a-fA-F]{6}$/.test(s.themeColor) ? s.themeColor : '#4176e6'
  const bg = s.background
  setKind(bg.kind)
  els.bgColor.value = bg.color
  els.gradFrom.value = bg.gradientFrom
  els.gradTo.value = bg.gradientTo
  els.gradAngle.value = bg.gradientAngle
  els.gradAngleVal.textContent = `${bg.gradientAngle}°`
  els.imagePath.value = bg.imagePath || ''
  els.opacity.value = Math.round(bg.imageOpacity * 100)
  els.opacityVal.textContent = `${Math.round(bg.imageOpacity * 100)}%`
  const m = bg.overlay.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (m) {
    els.overlay.value = `#${[+m[1], +m[2], +m[3]].map(v => v.toString(16).padStart(2, '0')).join('')}`
    els.overlayAlpha.value = m[4] !== undefined ? Math.round(+m[4] * 100) : 45
  }
  els.customCss.value = s.customCss || ''
}

function collect() {
  const kind = els.kindButtons.find(b => b.classList.contains('active')).dataset.kind
  const alpha = (Number(els.overlayAlpha.value) || 0) / 100
  return {
    themeColor: els.themeColor.value === '#4176e6' ? '' : els.themeColor.value,
    background: {
      kind,
      color: els.bgColor.value,
      gradientFrom: els.gradFrom.value,
      gradientTo: els.gradTo.value,
      gradientAngle: Number(els.gradAngle.value),
      imagePath: els.imagePath.value,
      imageOpacity: (Number(els.opacity.value) || 85) / 100,
      overlay: hexToRgba(els.overlay.value, alpha),
    },
    customCss: els.customCss.value,
  }
}

let timer = null
function scheduleApply() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    dshPanel.set(collect()).then(s => {
      els.status.textContent = `已应用 · 后端 ${s.background.kind}`
    }).catch(() => { els.status.textContent = '应用失败' })
  }, 250)
}

// ── 事件绑定 ────────────────────────────────────────────────────────────────

els.themeColor.addEventListener('input', scheduleApply)
els.themeReset.addEventListener('click', () => {
  els.themeColor.value = '#4176e6'
  scheduleApply()
})
els.kindButtons.forEach(b => b.addEventListener('click', () => {
  setKind(b.dataset.kind)
  scheduleApply()
}))
;[els.bgColor, els.gradFrom, els.gradTo, els.gradAngle, els.opacity, els.overlay, els.overlayAlpha, els.customCss]
  .forEach(el => el.addEventListener('input', scheduleApply))
els.gradAngle.addEventListener('input', () => { els.gradAngleVal.textContent = `${els.gradAngle.value}°` })
els.opacity.addEventListener('input', () => { els.opacityVal.textContent = `${els.opacity.value}%` })

els.pickImage.addEventListener('click', async () => {
  const p = await dshPanel.pickImage()
  if (p) {
    els.imagePath.value = p
    scheduleApply()
  }
})

els.resetAll.addEventListener('click', async () => {
  const s = await dshPanel.reset()
  populate(s)
  els.status.textContent = '已恢复默认'
})

els.browser.addEventListener('click', () => dshPanel.openInBrowser())
els.restart.addEventListener('click', async () => {
  els.status.textContent = '正在重启后端…'
  await dshPanel.restartBackend()
  els.status.textContent = '后端已重启'
})
els.quit.addEventListener('click', () => dshPanel.quit())
els.close.addEventListener('click', () => window.close())

// ── 初始化 ──────────────────────────────────────────────────────────────────

;(async () => {
  const [s, status] = await Promise.all([dshPanel.get(), dshPanel.getStatus()])
  populate(s)
  els.status.textContent = status.url ? `后端就绪 · ${status.url}` : '后端未就绪'
})()
