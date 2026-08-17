/**
 * 生成应用图标（build/icon.icns）。
 *
 * 两种来源：
 * - DSH_ICON_SRC 指向位图（.jpg/.jpeg/.png/.webp）：居中裁方 → 1024 → 圆角蒙版（macOS 风格，半径≈22.5%）
 * - 默认（SVG）：DSH 鲸鱼 logo（白）置于 DeepSeek 蓝渐变圆角底上
 *
 * 之后渲染全部 iconset 尺寸并合成 .icns。
 * 运行：node scripts/make-icon.js
 * 依赖：sharp（位图）、@resvg/resvg-js（SVG）
 */

const { execFileSync } = require('node:child_process')
const { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } = require('node:fs')
const { join, extname } = require('node:path')

const ROOT = join(__dirname, '..')
const BUILD = join(ROOT, 'build')
const OUT_ICNS = join(BUILD, 'icon.icns')

const ICON_SRC = process.env.DSH_ICON_SRC || '/Users/yea/dev/deepseek-harness/apps/web/public/favicon.svg'
const IS_RASTER = ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(ICON_SRC).toLowerCase())

const SIZE = 1024
const CORNER_RADIUS = Math.round(SIZE * 0.225) // macOS Big Sur+ 风格圆角
const SIZES = [16, 32, 128, 256, 512] // iconset：各尺寸 + @2x

/** 返回 { name: pngBuffer } 的 iconset。 */
async function buildIconset() {
  if (IS_RASTER) {
    const sharp = require('sharp')
    // 纵向完整显示、横向拓展成方形：
    // 背景 = 原图 cover 铺满 1024² + 高斯模糊（拓展的横向底色）；
    // 前景 = 原图按完整高度等比缩放（纵向零裁切）居中叠加；
    // 最后套 macOS 圆角蒙版。
    const bg = await sharp(ICON_SRC)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .blur(90)
      .png()
      .toBuffer()
    const fg = await sharp(ICON_SRC)
      .resize(SIZE, SIZE, { fit: 'contain', position: 'centre' })
      .png()
      .toBuffer()
    const composed = await sharp(bg)
      .composite([{ input: fg, gravity: 'centre' }])
      .png()
      .toBuffer()
    const maskSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" fill="#000"/>` +
      `</svg>`,
    )
    const masked = await sharp(composed)
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .png()
      .toBuffer()
    const out = {}
    for (const s of SIZES) {
      const buf = await sharp(masked).resize(s, s).png().toBuffer()
      out[`icon_${s}x${s}.png`] = buf
      const buf2 = await sharp(masked).resize(s * 2, s * 2).png().toBuffer()
      out[`icon_${s}x${s}@2x.png`] = buf2
    }
    return out
  }

  // ── SVG 路径：DSH 鲸鱼 × 蓝色渐变 ──
  const { Resvg } = require('@resvg/resvg-js')
  const svgText = readFileSync(ICON_SRC, 'utf8')
  const m = svgText.match(/<path[^>]*\bd="([^"]+)"/)
  if (!m) throw new Error('SVG 中未找到 path')
  const whaleD = m[1]
  // 鲸鱼在 50x50 viewBox 里的近似包围盒
  const WHALE = { minX: 0.53, minY: 7.01, w: 48.8, h: 36.57 }
  const SCALE = 11.5 // 约占 56%
  const whaleW = WHALE.w * SCALE
  const whaleH = WHALE.h * SCALE
  const tx = (SIZE - whaleW) / 2 - WHALE.minX * SCALE
  const ty = (SIZE - whaleH) / 2 - WHALE.minY * SCALE
  const compositeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5B8CF8"/>
        <stop offset="0.55" stop-color="#4176E6"/>
        <stop offset="1" stop-color="#2F55D4"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${CORNER_RADIUS}" fill="url(#bg)"/>
    <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${SCALE})" fill="#ffffff">
      <path d="${whaleD}"/>
    </g>
  </svg>`
  const out = {}
  for (const s of SIZES) {
    const render = (w) => new Resvg(compositeSvg, { fitTo: { mode: 'width', value: w } }).render().asPng()
    out[`icon_${s}x${s}.png`] = render(s)
    out[`icon_${s}x${s}@2x.png`] = render(s * 2)
  }
  return out
}

async function main() {
  console.log(`图标来源：${ICON_SRC}（${IS_RASTER ? '位图' : 'SVG'}）`)
  const iconset = join(BUILD, 'icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })

  const files = await buildIconset()
  for (const [name, buf] of Object.entries(files)) {
    writeFileSync(join(iconset, name), buf)
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', OUT_ICNS])
  console.log(`图标已生成：${OUT_ICNS}（${(statSync(OUT_ICNS).size / 1024).toFixed(0)}KB）`)
}

main().catch(err => {
  console.error('图标生成失败：', err.message)
  process.exit(1)
})
