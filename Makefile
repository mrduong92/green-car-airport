DOCKER_COMPOSE = docker compose
APP      = $(DOCKER_COMPOSE) exec app
FRONTEND = $(DOCKER_COMPOSE) exec frontend

.PHONY: up down build restart logs shell artisan composer migrate fresh test lint \
        fe-shell fe-install fe-build logs-fe-driver fe-shell-driver logs-fe-admin fe-shell-admin \
        android-customer android-driver android-build

# ── Docker ─────────────────────────────────────────────────────────────────────
up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down

build:
	$(DOCKER_COMPOSE) build --no-cache

restart:
	$(DOCKER_COMPOSE) restart

logs:
	$(DOCKER_COMPOSE) logs -f

logs-fe:
	$(DOCKER_COMPOSE) logs -f frontend

logs-fe-driver:
	$(DOCKER_COMPOSE) logs -f frontend_driver

logs-fe-admin:
	$(DOCKER_COMPOSE) logs -f frontend_admin

logs-worker:
	$(DOCKER_COMPOSE) logs -f worker

# ── Backend (Laravel) ───────────────────────────────────────────────────────────
shell:
	$(DOCKER_COMPOSE) exec app bash

artisan:
	$(APP) php artisan $(filter-out $@,$(MAKECMDGOALS))

composer:
	$(APP) composer $(filter-out $@,$(MAKECMDGOALS))

migrate:
	$(APP) php artisan migrate

fresh:
	$(APP) php artisan migrate:fresh --seed

test:
	$(APP) php artisan test

lint:
	$(APP) ./vendor/bin/pint

# ── Frontend (React) ────────────────────────────────────────────────────────────
fe-shell:
	$(DOCKER_COMPOSE) exec frontend sh

fe-shell-driver:
	$(DOCKER_COMPOSE) exec frontend_driver sh

fe-shell-admin:
	$(DOCKER_COMPOSE) exec frontend_admin sh

fe-install:
	$(FRONTEND) npm install

fe-build:
	$(FRONTEND) npm run build

# ── Android native (Capacitor) ─────────────────────────────────────────────────
# Build trên HOST (Node 22 + JDK 21), không trong container: container frontend
# mount repo chính, build trong đó có thể ra bundle của nhánh khác.
# `java_home -F`: không có -F thì `-v 21` lặng lẽ trả về JDK khác khi máy thiếu 21.
JAVA21 = $(shell /usr/libexec/java_home -F -v 21 2>/dev/null)
ANDROID_SDK ?= $(or $(ANDROID_HOME),$(HOME)/Library/Android/sdk)
NATIVE_DIST_customer = dist-native
NATIVE_DIST_driver   = dist-driver-native

android-customer:
	@$(MAKE) --no-print-directory android-build APP=customer

android-driver:
	@$(MAKE) --no-print-directory android-build APP=driver

android-build:
	@test -n "$(JAVA21)" || { echo "✗ Thiếu JDK 21 — docs/MOBILE.md mục Build nhanh"; exit 1; }
	@test -d "$(ANDROID_SDK)" || { echo "✗ Không thấy Android SDK ở $(ANDROID_SDK) — đặt ANDROID_HOME"; exit 1; }
	@test -f mobile/keystore.properties || { echo "✗ Thiếu mobile/keystore.properties — docs/MOBILE.md mục Khoá ký"; exit 1; }
	@test -f mobile/$(APP)/android/app/google-services.json || { echo "✗ Thiếu google-services.json cho $(APP) — không có thì app không nhận push"; exit 1; }
	@test -f frontend/public/sounds/new_ride.mp3 || { echo "✗ Thiếu frontend/public/sounds/new_ride.mp3"; exit 1; }
	@test -f frontend/.env.native || { echo "✗ Thiếu frontend/.env.native — docs/MOBILE.md"; exit 1; }
	node mobile/scripts/check-capacitor-versions.mjs
	cd frontend && npm run build:$(APP):native
	@! grep -l "e2e-test-placeholder" frontend/$(NATIVE_DIST_$(APP))/assets/*.js || { echo "✗ Bundle mang key Goong giả của e2e — kiểm frontend/.env"; exit 1; }
	mkdir -p mobile/$(APP)/android/app/src/main/res/raw
	cp frontend/public/sounds/new_ride.mp3 mobile/$(APP)/android/app/src/main/res/raw/new_ride.mp3
	cd mobile/$(APP) && npx cap sync android
	cd mobile/$(APP)/android && ANDROID_HOME=$(ANDROID_SDK) JAVA_HOME=$(JAVA21) ./gradlew --no-daemon clean assembleRelease bundleRelease
	mkdir -p dist-mobile
	@V=$$(node -p "require('./mobile/$(APP)/package.json').version"); \
	  cp mobile/$(APP)/android/app/build/outputs/apk/release/app-release.apk dist-mobile/greenca-$(APP)-$$V.apk; \
	  cp mobile/$(APP)/android/app/build/outputs/bundle/release/app-release.aab dist-mobile/greenca-$(APP)-$$V.aab; \
	  echo "✓ dist-mobile/greenca-$(APP)-$$V.apk + .aab"

%:
	@:
