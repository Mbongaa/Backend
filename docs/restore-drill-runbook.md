# Restore Drill — Bayaan POS

Owner: Bayaan ops / Codex
Last revised: 2026-05-21

The backup-without-tested-restore problem is real: a `pg_dump` that has never
been restored is a guess, not a recovery plan. This runbook proves the backup
procedure produces a working system, and gives you a routine you can rerun
before every pilot milestone.

## Scope

This drill covers the Bayaan POS Postgres database and the
`bayaan_fnb_kiosk` Odoo addon. It does **not** cover OS-level state, attached
filestore on disk, or external payment-provider credentials — those need
parallel runbooks once hosting is finalized.

## Prerequisites

- The Bayaan Docker stack is running (`make up` brings up `db`, `odoo`,
  `frontend`).
- Postgres is reachable from the `odoo` service (`pg_isready` returns
  `accepting connections`).
- At least one backup archive exists in `backups/` — create one with
  `make backup` if not.

## Quick commands

Backup (manual or scheduled):

```bash
make backup
```

End-to-end automated drill (recommended weekly during pilot):

```bash
make restore-drill
```

Targeted restore into a custom DB (no addon upgrade):

```bash
make restore RESTORE_DB=bayaan_recovery_check BACKUP=backups/bayaan-2026-05-21-120000.sql.gz
```

## Step-by-step drill

1. **Snapshot the production DB.**
   ```bash
   make backup
   ```
   Output: a gzipped SQL dump in `backups/bayaan-YYYYMMDD-HHMMSS.sql.gz`.
   Confirm the file size is non-zero and recently dated.

2. **Restore into a disposable DB.**
   `make restore-drill` will:
   - drop the temporary database `bayaan_restore_drill` if it exists,
   - recreate it empty,
   - stream the gzipped dump into it via `psql`,
   - upgrade the Bayaan addon (`-u bayaan_fnb_kiosk --stop-after-init`) to
     prove the migration steps still apply against the restored data.

3. **Smoke the restored database.**
   Restart Odoo against the restored DB and check three things:
   ```bash
   docker compose run --rm -e ODOO_DB=bayaan_restore_drill odoo \
     odoo -d bayaan_restore_drill --workers=0 --http-port=8079 --no-http
   ```
   Then in another shell or via the Bayaan dashboard pointing at port 8079:
   - `GET /bayaan/api/auth_status` — should return `authenticated=true` for
     a manager login.
   - `POST /bayaan/api/chain_bootstrap` — should return kiosks, products, and
     report periods. Cross-check at least one kiosk's `sales_today` against
     the production dashboard for the same date — they should match.
   - `POST /bayaan/api/audit_log` — should return the most recent audit
     events from the restored snapshot.

4. **Tear down.**
   ```bash
   docker compose exec db dropdb -U odoo bayaan_restore_drill
   ```

## Cadence

| Phase | Drill frequency |
|---|---|
| Pre-pilot | Run once and document the timing. |
| Pilot (1–2 kiosks live) | Weekly. |
| Production (10+ kiosks) | Twice monthly + after every Odoo addon change. |

## Recovery time objective (RTO)

Target: restoration + addon upgrade + smoke check completes in **≤ 15 minutes**
for a database under 5 GB. If the drill exceeds 30 minutes, treat it as a
finding and tune `pg_dump` compression / restore parallelism before the next
attempt.

## Recovery point objective (RPO)

The current cadence depends on when `make backup` runs. For production:

- Schedule `make backup` hourly via cron.
- Ship the gzipped dumps to a second host (cloud bucket or off-site mirror)
  before declaring the backup successful.
- Keep the last 24 hourly dumps, last 14 daily dumps, last 12 monthly dumps.

## What to do when the drill fails

| Symptom | Likely cause | Action |
|---|---|---|
| `psql` errors on restore | dump truncated or version mismatch | Re-run `pg_dump --format=custom`; confirm matching Postgres major versions on source and target. |
| Bayaan addon upgrade errors | a migration assumed schema you no longer have | Capture the exact log; rollback to the previous addon version on staging; fix the migration before re-running. |
| `chain_bootstrap` returns no kiosks | sequence/permission state lost | Confirm `res.users` and `res.groups` were included in the dump (they always are with `pg_dump -Fc -d <db>`). Confirm `bayaan.kiosk` rows exist via `psql`. |
| `audit_log` empty | filestore or audit table missing | Check `bayaan_audit_event` row count in the restored DB; if zero, the live DB was empty too — verify against production. |

## Outside scope (and why)

- **Filestore (`/var/lib/odoo/filestore/<db>`)** — once we have receipts,
  uploaded logos, or scanned waste evidence, this needs its own rsync or
  bucket-snapshot drill. It is intentionally not included here yet because the
  current addon does not depend on filestore content for correctness.
- **SSL certificates and reverse-proxy config** — those belong in the
  deployment runbook once the hosting choice is final (Caddy/Traefik/cloud LB).
- **Iraqi chart-of-accounts validation** — external blocker; the client's
  accountant must sign off, and that lives outside this codebase.
