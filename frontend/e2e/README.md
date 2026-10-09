# E2E suite (Playwright)

## Before every run

Run `make fresh` (`docker compose exec app php artisan migrate:fresh --seed`)
first. **The suite is not idempotent** — it drains the seeded driver's wallet
by roughly 400 points per full run against a 2,044-point seeded start. After
about five runs without reseeding, `TripController::accept` starts rejecting
the driver for insufficient balance, and failures will look like app bugs.

`frontend/.env` needs a non-empty `VITE_GOONG_API_KEY`. `goongAutocomplete()`
(`src/api/goong.ts`) short-circuits to `return []` before calling `fetch()`
when the key is falsy, so `stubGoong()`'s `page.route` interception never sees
a request if the key is empty. The value itself doesn't matter — every Goong
call is stubbed — a placeholder is fine.

## Running

Playwright runs on the **host**, against the app in **Docker**:

    cd frontend && npx playwright test

Check `ps aux | grep "playwright test"` first — two concurrent runs corrupt
the shared database. The suite is `workers: 1` / `fullyParallel: false`:
specs share the seeded driver/admin accounts and trip pool.

## Ports

Customer 5173, Driver 5174, Admin 5175.

## Rủi ro service Zalo thật (`free-rides-accounts.spec.ts`)

`free-rides-accounts.spec.ts` (tab admin "Nick Zalo") giả lập service Node bằng cách tự ký HMAC gọi
thẳng `/api/internal/zalo/account-requests*` — tạo một yêu cầu `login` thật trong DB. Nếu có service
giai đoạn 5 (`zalo-service/`) đang chạy và polling **cùng `API_BASE_URL`** (vd. trỏ vào staging dùng
chung với e2e), nó sẽ thấy yêu cầu này và chạy `loginQR` — **đăng nhập Zalo thật** — cho một account_id
giả do test sinh ra (`AccountRequestsPoller.poll()` không lọc theo account_id đã biết, lấy bất kỳ yêu
cầu `pending` hợp lệ nào).

Vì vậy test này **chỉ chạy khi đặt `E2E_ALLOW_ACCOUNT_REQUESTS=1`**, mặc định bị `test.skip()`:

```bash
E2E_ALLOW_ACCOUNT_REQUESTS=1 npx playwright test e2e/free-rides-accounts.spec.ts
```

Chỉ bật cờ này khi chắc chắn **không có service giai đoạn 5 nào đang polling** `API_BASE_URL` của lần
chạy test (vd. môi trường local hoàn toàn tách biệt, hoặc service thật tạm dừng). Không bật cờ này khi
chạy nhắm vào staging/production đang có service thật chạy.
