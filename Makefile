DOCKER_COMPOSE = docker compose
APP      = $(DOCKER_COMPOSE) exec app
FRONTEND = $(DOCKER_COMPOSE) exec frontend

.PHONY: up down build restart logs shell artisan composer migrate fresh test lint \
        fe-shell fe-install fe-build

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

fe-install:
	$(FRONTEND) npm install

fe-build:
	$(FRONTEND) npm run build

%:
	@:
