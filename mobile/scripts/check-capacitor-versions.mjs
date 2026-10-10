// mobile/scripts/check-capacitor-versions.mjs
// Plugin @capacitor/* phải CÙNG phiên bản chính xác ở bundle JS (frontend) và vỏ
// native (mobile/<app>) — lệch là cầu nối JS ↔ native gọi sai chữ ký, lỗi lúc chạy.
import { readFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const front = read('../../frontend/package.json').dependencies
let failed = false

for (const app of ['customer', 'driver']) {
  const shell = read(`../${app}/package.json`).dependencies
  for (const [name, version] of Object.entries(front)) {
    if (!name.startsWith('@capacitor/')) continue
    if (shell[name] !== version) {
      console.error(`✗ ${name}: frontend ${version} ≠ mobile/${app} ${shell[name] ?? '(thiếu)'}`)
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log('✓ Phiên bản @capacitor/* khớp giữa frontend và mobile/*')
