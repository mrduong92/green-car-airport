// Chạy trên MÁY CÁ NHÂN (cần mở ảnh QR để quét), KHÔNG chạy trên VPS:
//   npm run login -- acc1
// Quét QR bằng tài khoản Zalo PHỤ → data/accounts/acc1.json → copy lên VPS.
// Cách khác (giai đoạn 5): thêm nick ngay trên trang admin (Cuốc Free → Nick Zalo), không cần script này.
import { Zalo } from 'zca-js'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { ACCOUNT_ID_PATTERN } from '../src/account-requests.js'
import { runQrLogin, QrExpiredError } from '../src/zalo-login.js'

const id = process.argv[2]
if (!id || !ACCOUNT_ID_PATTERN.test(id)) {
  console.error('Cách dùng: npm run login -- <tên-tài-khoản> (chữ thường, số, gạch ngang, tối đa 32 ký tự)')
  process.exit(1)
}

const dataDir = process.env.DATA_DIR || './data'
const accountsDir = join(dataDir, 'accounts')
mkdirSync(accountsDir, { recursive: true })
const qrPath = join(dataDir, `login-qr-${id}.png`)

let credentials: unknown
try {
  ({ credentials } = await runQrLogin({
    loginQR: (onEvent) => new Zalo({ selfListen: false, logging: false }).loginQR({ qrPath }, onEvent as Parameters<Zalo['loginQR']>[1]),
    onQr: async (image) => {
      writeFileSync(qrPath, Buffer.from(image, 'base64'))
      console.log('>> Quét QR bằng tài khoản Zalo PHỤ:', qrPath)
      try { execSync(`open "${qrPath}"`) } catch { /* không mở được thì tự mở file */ }
    },
  }))
} catch (err) {
  console.error(err instanceof QrExpiredError ? '!! Hết 3 lần mã QR mà chưa quét — chạy lại' : `!! Đăng nhập lỗi: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

const out = join(accountsDir, `${id}.json`)
writeFileSync(out, JSON.stringify(credentials), { mode: 0o600 })
chmodSync(out, 0o600) // file cũ (đăng nhập lại) giữ quyền cũ nếu chỉ dùng mode
console.log('>> Đã lưu phiên:', out, '— copy lên VPS (xem README)')
process.exit(0)
