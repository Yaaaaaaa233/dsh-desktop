/**
 * 应用外观设置：读写 userData 下的 settings.json。
 * 纯 Node 模块，可单独测试。
 */

const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { dirname } = require('node:path')

const DEFAULTS = {
  // 主题色（品牌色）hex，空字符串 = 使用 DSH 默认蓝
  themeColor: '',
  // 背景定制
  background: {
    kind: 'default', // 'default' | 'color' | 'gradient' | 'image'
    color: '#f6f7fb',
    gradientFrom: '#1e2a4a',
    gradientTo: '#4a3f6b',
    gradientAngle: 135,
    imagePath: '',
    imageOpacity: 0.85,
    // 覆盖在背景图上的半透明遮罩，保证文字可读性
    overlay: 'rgba(13, 18, 33, 0.45)',
  },
  // 追加到页面末尾的自定义 CSS（优先级最高）
  customCss: '',
}

/** 深度合并，保持 defaults 结构完整。 */
function mergeSettings(base, patch) {
  const out = { ...base }
  if (patch && typeof patch === 'object') {
    for (const key of Object.keys(patch)) {
      if (key === 'background' && patch.background && typeof patch.background === 'object') {
        out.background = { ...base.background, ...patch.background }
      } else if (patch[key] !== undefined) {
        out[key] = patch[key]
      }
    }
  }
  return out
}

function load(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return mergeSettings(DEFAULTS, parsed)
  } catch {
    return mergeSettings(DEFAULTS, {})
  }
}

function save(file, settings) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n', 'utf8')
}

module.exports = { DEFAULTS, load, save, mergeSettings }
