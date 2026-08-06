# E2E auth — PRODUCTION

Bộ test chạy thẳng vào `greenca.vn` / `driver.greenca.vn` / `admin.greenca.vn`.

## Chạy

```bash
cd frontend
E2E_ADMIN_PHONE=0868968312 E2E_ADMIN_PASSWORD=<mật khẩu admin> \
  npx playwright test --config=playwright.prod.config.ts
```

Thiếu 2 biến env thì nhóm test "tài khoản admin thật" tự `skip`, 9 test còn lại vẫn chạy.
**Đừng commit mật khẩu vào repo** — truyền qua env.

Đổi đích bằng `E2E_URL_CUSTOMER` / `E2E_URL_DRIVER` / `E2E_URL_ADMIN` (mặc định là production).

Playwright phải có trên **host** (không phải trong Docker):

```bash
npm install --no-save @playwright/test@1.62.1 && npx playwright install chromium
```

## ⚠️ Vì sao KHÔNG dùng được suite ở `e2e/`

Suite `e2e/` viết cho môi trường dev localhost. Trỏ nó vào production sẽ hỏng, và một lỗi
trong đó là **phá huỷ**:

| Vấn đề | Hậu quả trên production |
|---|---|
| `e2e/README.md` yêu cầu chạy `make fresh` trước mỗi lần | `migrate:fresh --seed` — **XOÁ SẠCH DATABASE PRODUCTION** |
| `TEST_OTP = '000000'` trong `fixtures/testData.ts` | Production đã tắt bypass (commit `3c50f33`) → mọi test đăng ký fail ở bước OTP |
| `SEEDED` = `0901234567` / `0912345678` / `0923456789` | Không tồn tại trên production (DB chỉ có 1 admin) → mọi test login fail |
| "Suite is not idempotent" — tạo booking, rút ví tài xế | Bơm user `0999xxxxxx` và booking giả vào DB thật |
| `APP` hardcode `http://localhost:5173/5174/5175` | Không trỏ tới production |

Vì vậy `e2e-prod/` là bộ **riêng**, config **riêng** (`playwright.prod.config.ts`), để
`npx playwright test` (không có `--config`) không bao giờ vô tình bắn vào production.

## Nguyên tắc: không để lại dữ liệu

Đã verify trước/sau khi chạy: `users=1 bookings=0 tokens=0` — không đổi.

- Các test dùng số `0999000111` chỉ gọi `POST /auth/check-phone`, đã kiểm là SELECT thuần
  (`AuthController::checkPhone`) — không ghi gì.
- Test **duy nhất** có ghi là "mật khẩu đúng đăng nhập được vào dashboard": đăng nhập thành công
  tạo 1 dòng `personal_access_tokens`. Test tự gọi `POST /api/auth/logout` để thu hồi đúng token đó.
  Nếu sửa test này, **giữ lại bước logout** — không thì mỗi lần chạy bỏ lại một token chết.

**Không** test luồng đăng ký: cần OTP thật gửi qua ZNS, test không nhận được SMS.
Luồng đăng ký phải test trên staging (nơi bypass `000000` còn bật).

## Suite kiểm gì

- 3 app đều trả 200 và render được form đăng nhập
- Số chưa đăng ký bị chặn đúng ở cả 3 app (mỗi app một thông báo riêng)
- 3 route được bảo vệ đều đẩy về `/login` khi chưa đăng nhập
- **Mã bypass `000000` không đăng nhập được** — chốt chặn hồi quy cho commit `3c50f33`
- Mật khẩu sai bị từ chối, mật khẩu đúng vào được dashboard
- Cách ly role: số admin không đăng nhập được vào app khách hàng / tài xế
