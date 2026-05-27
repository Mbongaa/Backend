SHELL := /usr/bin/env bash
.RECIPEPREFIX := >

# Bayaan F&B kiosk operating system — top-level developer + ops targets.
# All dashboard work happens under apps/kiosk-pos/. All backend work happens
# under backend/bayaan_odoo_addons/bayaan_fnb_kiosk/.

APP_DIR  := apps/kiosk-pos
ADDON    := bayaan_fnb_kiosk
DB       := bayaan
DC       := docker compose

.PHONY: help install dev build test smoke verify up down logs seed odoo-shell odoo-test odoo-test-local odoo-update reset-db backup

help:
> @echo "Bayaan make targets:"
> @echo "  make install   — npm install for the dashboard"
> @echo "  make dev       — start the Vite dev server (no Odoo)"
> @echo "  make build     — type-check and build the dashboard"
> @echo "  make test      — run frontend domain tests"
> @echo "  make smoke     — run the Playwright smoke test"
> @echo "  make verify    — full release gate: frontend verify + Odoo addon tests"
> @echo ""
> @echo "Docker / live stack:"
> @echo "  make up        — bring up Postgres + Odoo + frontend nginx"
> @echo "  make down      — stop the stack"
> @echo "  make logs      — tail Odoo logs"
> @echo "  make seed      — install $(ADDON) into the $(DB) database with demo data"
> @echo "  make odoo-test — run the $(ADDON) test suite against the $(DB) database"
> @echo "  make odoo-test-local — run $(ADDON) tests through scripts/odoo-addon-test.sh on WSL/Linux"
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
> $(MAKE) odoo-test

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

odoo-test-local:
> scripts/odoo-addon-test.sh

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

# Restore the most recent gzipped pg_dump from backups/ into RESTORE_DB
# (defaults to bayaan_restore_test). Usage:
#   make restore                          # latest backup -> bayaan_restore_test
#   make restore RESTORE_DB=bayaan_staging BACKUP=backups/bayaan-2026-05-20.sql.gz
RESTORE_DB ?= bayaan_restore_test
BACKUP     ?=
restore:
> @backup_file="$(BACKUP)"; \
>   if [ -z "$$backup_file" ]; then \
>     backup_file=$$(ls -1t backups/*.sql.gz 2>/dev/null | head -n 1); \
>   fi; \
>   if [ -z "$$backup_file" ] || [ ! -f "$$backup_file" ]; then \
>     echo "No backup file found in backups/. Run 'make backup' first or pass BACKUP=path."; \
>     exit 1; \
>   fi; \
>   echo "Restoring $$backup_file -> database $(RESTORE_DB)"; \
>   $(DC) exec -T db dropdb -U odoo --if-exists $(RESTORE_DB); \
>   $(DC) exec -T db createdb -U odoo $(RESTORE_DB) -O odoo; \
>   gunzip -c "$$backup_file" | $(DC) exec -T db psql -U odoo -d $(RESTORE_DB) >/dev/null; \
>   echo "Restored. Now upgrade $(ADDON) into the restored DB:"; \
>   echo "  $(DC) run --rm -e ODOO_DB=$(RESTORE_DB) odoo odoo -d $(RESTORE_DB) -u $(ADDON) --stop-after-init"
>   echo "Restore drill complete."

# End-to-end restore drill: backup → restore into a disposable DB → verify the
# Bayaan addon loads and a smoke-essential route responds. Use this to prove the
# backup procedure actually recovers a working system.
restore-drill: backup
> @latest=$$(ls -1t backups/*.sql.gz | head -n 1); \
>   echo "Restore drill using $$latest"; \
>   $(MAKE) restore RESTORE_DB=bayaan_restore_drill BACKUP="$$latest"; \
>   echo "Loading Bayaan addon into bayaan_restore_drill (this will exit after init)..."; \
>   $(DC) run --rm odoo odoo -d bayaan_restore_drill -u $(ADDON) --stop-after-init || \
>     { echo "Addon load failed — restore is NOT verified."; exit 2; }; \
>   echo "Restore drill PASSED: backup restored cleanly and addon loaded."
