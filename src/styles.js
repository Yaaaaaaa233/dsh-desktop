/**
 * 由外观设置生成注入到 DSH Web 页面里的 CSS。
 *
 * 注入思路（不修改 DSH 前端源码）：
 * - 主题色：把 DSH 主题里品牌色阶 `--dsw-static-deepseek-*` 重映射为用户所选色相；
 * - 背景：覆盖应用表面别名 `--dsw-alias-bg-base / layer-1..3`，背景图则额外叠加
 *   `body::before`（图）+ `body::after`（遮罩）两层固定定位层；
 * - 自定义 CSS：追加在最末尾，优先级最高。
 *
 * 纯 Node 模块，可单独测试。
 */

/** '#rrggbb' / '#rgb' -> [r,g,b] */
function hexToRgb(hex) {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 把 hex 与另一颜色按 t（0..1）混合；other 可为 '#ffffff' / '#000000'。 */
function mix(hex, otherHex, t) {
  const a = hexToRgb(hex)
  const b = hexToRgb(otherHex)
  if (!a || !b) return hex
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/** 主题色 → 覆盖品牌色阶。空值返回空串（用 DSH 默认蓝）。 */
function themeColorCss(themeColor) {
  if (!themeColor || !hexToRgb(themeColor)) return ''
  const shades = {
    '--dsw-static-deepseek-50': mix(themeColor, '#ffffff', 0.92),
    '--dsw-static-deepseek-100': mix(themeColor, '#ffffff', 0.82),
    '--dsw-static-deepseek-200': mix(themeColor, '#ffffff', 0.66),
    '--dsw-static-deepseek-300': mix(themeColor, '#ffffff', 0.45),
    '--dsw-static-deepseek-400': mix(themeColor, '#ffffff', 0.18),
    '--dsw-static-deepseek-450': mix(themeColor, '#ffffff', 0.10),
    '--dsw-static-deepseek-500': themeColor,
    '--dsw-static-deepseek-600': mix(themeColor, '#000000', 0.18),
    '--dsw-static-deepseek-700-delete': mix(themeColor, '#000000', 0.30),
    '--dsw-static-deepseek-800': mix(themeColor, '#000000', 0.45),
    '--dsw-static-deepseek-900': mix(themeColor, '#000000', 0.58),
  }
  return `:root{${Object.entries(shades).map(([k, v]) => `${k}:${v};`).join('')}}`
}

/**
 * 背景定制 → CSS。
 * @param {object} bg settings.background
 * @param {string} [imageDataUrl] 背景图（缩放后）的 data URL；仅 kind==='image' 时使用
 */
function backgroundCss(bg, imageDataUrl) {
  const surface = ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3']
  const setSurface = value => `:root{${surface.map(k => `${k}:${value};`).join('')}}`

  switch (bg.kind) {
    case 'color': {
      const c = hexToRgb(bg.color) ? bg.color : '#f6f7fb'
      return `${setSurface(c)}
html, body { background: ${c} !important; }`
    }
    case 'gradient': {
      const from = hexToRgb(bg.gradientFrom) ? bg.gradientFrom : '#1e2a4a'
      const to = hexToRgb(bg.gradientTo) ? bg.gradientTo : '#4a3f6b'
      const angle = Number(bg.gradientAngle) || 135
      const g = `linear-gradient(${angle}deg, ${from}, ${to})`
      return `${setSurface(g)}
html, body { background: ${g} !important; }`
    }
    case 'image': {
      if (!imageDataUrl) return backgroundCss({ ...bg, kind: 'color' })
      const opacity = Math.max(0, Math.min(1, Number(bg.imageOpacity) || 0.85))
      const overlay = /^rgba?\(/.test(bg.overlay || '') ? bg.overlay : 'rgba(13, 18, 33, 0.45)'
      return `
${setSurface('transparent')}
html, body { background: transparent !important; }
body::before {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: url('${imageDataUrl}') center / cover no-repeat;
  opacity: ${opacity};
}
body::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: ${overlay};
}`
    }
    default:
      return ''
  }
}

/**
 * 组装最终注入的 CSS 串。
 * @param {object} settings 完整设置（settings.js 结构）
 * @param {string} [imageDataUrl] 背景图 data URL（由主进程缩放后提供）
 */
function buildCss(settings, imageDataUrl) {
  const parts = [
    themeColorCss(settings.themeColor),
    backgroundCss(settings.background, imageDataUrl),
  ]
  if (settings.customCss && settings.customCss.trim()) parts.push(settings.customCss)
  return parts.filter(Boolean).join('\n')
}

module.exports = { buildCss, themeColorCss, backgroundCss, hexToRgb, mix }
