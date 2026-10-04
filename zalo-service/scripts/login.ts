// Chạy trên MÁY CÁ NHÂN (cần mở ảnh QR để quét), KHÔNG chạy trên VPS:
//   npm run login -- acc1
// Quét QR bằng tài khoản Zalo PHỤ → data/accounts/acc1.json → copy lên VPS.
import { Zalo, LoginQRCallbackEventType } from 'zca-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const id = process.argv[2]
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Cách dùng: npm run login -- <tên-tài-khoản> (chữ thường, số, gạch ngang)')
  process.exit(1)
}

const dataDir = process.env.DATA_DIR || './data'
const accountsDir = join(dataDir, 'accounts')
mkdirSync(accountsDir, { recursive: true })
const qrPath = join(dataDir, `login-qr-${id}.png`)

let credentials: unknown = null
await new Zalo({ selfListen: false, logging: false }).loginQR({ qrPath }, (event) => {
  if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
    writeFileSync(qrPath, Buffer.from(event.data.image, 'base64'))
    console.log('>> Quét QR bằng tài khoản Zalo PHỤ:', qrPath)
    try { execSync(`open "${qrPath}"`) } catch { /* không mở được thì tự mở file */ }
  } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
    console.log('>> QR hết hạn, tạo mới...')
    event.actions.retry()
  } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
    credentials = event.data
  }
})

if (!credentials) {
  console.error('!! Đăng nhập xong nhưng không nhận được phiên — thử lại')
  process.exit(1)
}
const out = join(accountsDir, `${id}.json`)
writeFileSync(out, JSON.stringify(credentials), { mode: 0o600 })
console.log('>> Đã lưu phiên:', out, '— copy lên VPS (xem README)')
process.exit(0)
