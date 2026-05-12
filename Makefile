SHELL := /usr/bin/env bash
.RECIPEPREFIX := >

# Bayaan F&B kiosk operating system — top-level developer + ops targets.
# All dashboard work happens under apps/kiosk-pos/. All backend work happens
# under backend/bayaan_odoo_addons/bayaan_fnb_kiosk/.

APP_DIR  := apps/kiosk-pos
ADDON    := bayaan_fnb_kiosk
DB       := bayaan
DC       := docker compose

.PHONY: help install dev build test smoke verify up down logs seed odoo-shell odoo-test odoo-update reset-db backup

help:
> @echo "Bayaan make targets:"
> @echo "  make install   — npm install for the dashboard"
> @echo "  make dev       — start the Vite dev server (no Odoo)"
> @echo "  make build     — type-check and build the dashboard"
> @echo "  make test      — run frontend domain tests"
> @echo "  make smoke     — run the Playwright smoke test"
> @echo "  make verify    — full release gate: test + build + smoke"
> @echo ""
> @echo "Docker / live stack:"
> @echo "  make up        — bring up Postgres + Odoo + frontend nginx"
> @echo "  make down      — stop the stack"
> @echo "  make logs      — tail Odoo logs"
> @echo "  make seed      — install $(ADDON) into the $(DB) database with demo data"
> @echo "  make odoo-test — run the $(ADDON) test suite against the $(DB) database"
> @echo "  make odoo-update — re-install $(ADDON) without demo data (production reload)"

install:
> cd $(APP_DIR) && npm install

dev: install
> cd $(APP_DIR) && npm run dev

build: install
> cd $(APP_DIR) && npm run build

test: install
> cd $(APP_DIR) && npm test

smoke: build
> cd $(APP_DIR) && npm run smoke

verify: install
> cd $(APP_DIR) && npm run verify

up:
> $(DC) up -d db
> $(DC) up -d odoo
> $(DC) up -d frontend

down:
> $(DC) down

logs:
> $(DC) logs -f odoo

seed:
> $(DC) run --rm odoo odoo -d $(DB) -i $(ADDON) --stop-after-init

odoo-test:
> $(DC) run --rm odoo odoo -d $(DB) -i $(ADDON) --test-enable --stop-after-init

odoo-update:
> $(DC) run --rm odoo odoo -d $(DB) -u $(ADDON) --without-demo=all --stop-after-init

reset-db:
> @read -p "This drops the $(DB) database. Type the database name to confirm: " confirm; \
>   if [ "$$confirm" = "$(DB)" ]; then \
>     $(DC) exec db dropdb -U odoo $(DB) && $(DC) exec db createdb -U odoo $(DB) -O odoo; \
>     echo "Database $(DB) reset."; \
>   else \
>     echo "Aborted."; \
>   fi

backup:
> mkdir -p backups
> $(DC) exec -T db pg_dump -U odoo $(DB) | gzip > backups/$(DB)-$$(date +%Y%m%d-%H%M%S).sql.gz
> @echo "Backup written to backups/"
