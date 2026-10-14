// mobile/scripts/render-asset-sources.mjs
// Sinh ảnh nguồn cho @capacitor/assets từ logo GreenCA (giống public/favicon.svg).
// Dùng Chromium của Playwright có sẵn ở frontend — không thêm thư viện.
// Chạy: node mobile/scripts/render-asset-sources.mjs  → mobile/assets/*.png
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const glyph = (scale, offset) =>
  `<g transform="translate(${offset} ${offset}) scale(${scale})"><path d="M36.29 15.4A15 15 0 1 0 39 24H26" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`
const gradient = `<defs><linearGradient id="g" x1="4" y1="0" x2="44" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#006a36"/><stop offset="1" stop-color="#004d27"/></linearGradient></defs>`
const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">${gradient}${inner}</svg>`

const sources = {
  // Icon đầy đủ (Android < 8 và Play Store)
  'icon-only.png': [1024, svg(1024, `<rect width="48" height="48" fill="url(#g)"/>${glyph(0.78, 5.28)}`)],
  // Adaptive icon: glyph nằm trong vùng an toàn 66% ở giữa
  'icon-foreground.png': [1024, svg(1024, glyph(0.5, 12))],
  'icon-background.png': [1024, svg(1024, `<rect width="48" height="48" fill="url(#g)"/>`)],
  // Splash: tile logo nhỏ giữa nền warm-white
  'splash.png': [2732, svg(2732, `<rect width="48" height="48" fill="#F8FAF9"/><g transform="translate(19 19) scale(0.2083)"><rect width="48" height="48" rx="10.8" fill="url(#g)"/>${glyph(0.78, 5.28)}</g>`)],
}

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, [size, markup]] of Object.entries(sources)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`)
  await page.screenshot({ path: new URL(`../assets/${name}`, import.meta.url).pathname, omitBackground: true })
  console.log('✓', name)
}
await browser.close()
