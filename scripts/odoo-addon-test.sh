#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ODOO_DIR="${ODOO_DIR:-$ROOT_DIR/backend/odoo}"
# The Python interpreter that runs odoo-bin. Defaults to the in-tree venv for
# backward compatibility, but the verified WSL environment uses a separate venv
# (/home/hassan/bayaan-venv/bin/python), so allow an explicit override.
PYTHON_BIN="${PYTHON_BIN:-$ODOO_DIR/.venv/bin/python}"
ADDON="${ADDON:-bayaan_fnb_kiosk}"
ADDONS_PATH="${ADDONS_PATH:-addons,../bayaan_odoo_addons}"
TEST_TAGS="${TEST_TAGS:-/$ADDON}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DB="${DB:-bayaan_codex_${STAMP}}"
HTTP_PORT="${HTTP_PORT:-8079}"
TEST_TIMEOUT_SECONDS="${TEST_TIMEOUT_SECONDS:-1800}"
KEEP_DB="${KEEP_DB:-0}"
DROP_FAILED_DB="${DROP_FAILED_DB:-0}"
ALLOW_NON_CODEX_DB="${ALLOW_NON_CODEX_DB:-0}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/backend/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/odoo-addon-test-${DB}.log}"

case "$DB" in
  bayaan_codex_*) ;;
  *)
    if [ "$ALLOW_NON_CODEX_DB" != "1" ]; then
      echo "Refusing to run addon tests against non-disposable DB '$DB'." >&2
      echo "Use DB=bayaan_codex_<name> or ALLOW_NON_CODEX_DB=1 if you really mean it." >&2
      exit 2
    fi
    ;;
esac

if [ ! -f "$ODOO_DIR/odoo-bin" ]; then
  echo "Cannot find Odoo at $ODOO_DIR/odoo-bin" >&2
  exit 2
fi

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Cannot find executable Odoo Python at $PYTHON_BIN" >&2
  echo "Set PYTHON_BIN to the interpreter that has Odoo's requirements installed," >&2
  echo "or create $ODOO_DIR/.venv with: python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
  exit 2
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "Cannot find GNU timeout. Install coreutils or run inside WSL/Linux." >&2
  exit 2
fi

if ! command -v dropdb >/dev/null 2>&1; then
  echo "Cannot find dropdb. Install PostgreSQL client tools in WSL/Linux." >&2
  exit 2
fi

mkdir -p "$LOG_DIR"

cleanup_success() {
  if [ "$KEEP_DB" != "1" ]; then
    dropdb --if-exists "$DB" >/dev/null 2>&1 || true
  fi
}

cleanup_failure() {
  if [ "$DROP_FAILED_DB" = "1" ]; then
    dropdb --if-exists "$DB" >/dev/null 2>&1 || true
  else
    echo "Keeping failed test DB '$DB' for inspection. Set DROP_FAILED_DB=1 to remove it automatically." >&2
  fi
}

dropdb --if-exists "$DB" >/dev/null 2>&1 || true

echo "Running Bayaan addon tests"
echo "  db: $DB"
echo "  addon: $ADDON"
echo "  test tags: ${TEST_TAGS:-<odoo default>}"
echo "  odoo: $ODOO_DIR"
echo "  log: $LOG_FILE"
echo "  timeout: ${TEST_TIMEOUT_SECONDS}s"

cmd=(
  timeout "$TEST_TIMEOUT_SECONDS"
  "$PYTHON_BIN" odoo-bin server
  --addons-path="$ADDONS_PATH"
  -d "$DB"
  -i "$ADDON"
  --test-enable
  --stop-after-init
  --http-interface=127.0.0.1
  --http-port="$HTTP_PORT"
  --limit-time-real=0
  --limit-time-cpu=0
  --log-level=test
)

if [ -n "$TEST_TAGS" ]; then
  cmd+=(--test-tags "$TEST_TAGS")
fi

set +e
(
  cd "$ODOO_DIR"
  "${cmd[@]}"
) 2>&1 | tee "$LOG_FILE"
status="${PIPESTATUS[0]}"
set -e

if [ "$status" -eq 0 ]; then
  cleanup_success
  echo "Bayaan addon tests passed for $DB."
  exit 0
fi

if [ "$status" -eq 124 ]; then
  echo "Bayaan addon tests timed out after ${TEST_TIMEOUT_SECONDS}s." >&2
else
  echo "Bayaan addon tests failed with exit code $status." >&2
fi

echo "Last 80 log lines from $LOG_FILE:" >&2
tail -n 80 "$LOG_FILE" >&2 || true
cleanup_failure
exit "$status"
