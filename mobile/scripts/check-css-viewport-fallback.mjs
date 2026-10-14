// mobile/scripts/check-css-viewport-fallback.mjs
// Chặn bundle mà CSS dùng dvh/svh/lvh không kèm khai báo 100vh dự phòng.
//
// Vì sao: WebView Android cũ (Chrome < 108, vd. Xiaomi chưa cập nhật WebView) không hiểu
// dvh/svh → bỏ cả khai báo → khung app-shell (.h-app) mất chiều cao, bottom nav trôi theo
// nội dung (kẹt giữa màn hình / phải cuộn hết danh sách mới thấy). Bước nén CSS của Vite
// tự xoá dòng 100vh dự phòng nếu build target coi dvh là được hỗ trợ — lỗi không hiện ở
// trình duyệt mới nên chỉ một bước kiểm như này bắt được.
//
// Chạy: node mobile/scripts/check-css-viewport-fallback.mjs <thư-mục-dist>...
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dirs = process.argv.slice(2)
if (!dirs.length) {
  console.error('Cách dùng: node check-css-viewport-fallback.mjs <dist-dir>...')
  process.exit(1)
}

const problems = []
for (const dir of dirs) {
  const assets = join(dir, 'assets')
  for (const file of readdirSync(assets).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(join(assets, file), 'utf8')
    // Khối khai báo phẳng (selector{...}) — đủ cho CSS đã nén, không cần parser đầy đủ.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = body.split(';').map((d) => d.split(':').map((s) => s.trim()))
      for (const [prop, value] of decls) {
        if (!value || !/\d(dvh|svh|lvh)\b/.test(value)) continue
        const hasFallback = decls.some(([p, v]) => p === prop && v && /\dvh\b/.test(v) && !/\d(dvh|svh|lvh)\b/.test(v))
        if (!hasFallback) problems.push(`${file}: ${selector.trim()} { ${prop}: ${value} }`)
      }
    }
  }
}

if (problems.length) {
  console.error('✗ CSS dùng dvh/svh không có 100vh dự phòng — WebView Chrome < 108 sẽ vỡ layout:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`✓ dvh/svh đều có vh dự phòng (${dirs.join(', ')})`)
