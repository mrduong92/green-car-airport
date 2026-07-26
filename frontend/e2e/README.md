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
