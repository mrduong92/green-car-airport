DOCKER_COMPOSE = docker compose
APP = $(DOCKER_COMPOSE) exec app

.PHONY: up down build restart logs shell artisan composer migrate fresh test lint

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

%:
	@:
