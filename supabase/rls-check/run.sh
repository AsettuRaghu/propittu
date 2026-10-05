#!/usr/bin/env bash
#
# Applies every migration in supabase/migrations to a throwaway local
# Postgres (with a minimal Supabase shim) and runs the RLS test suite.
#
#   npm run test:rls
#
# Needs only Postgres server binaries (15+). No Docker, no Supabase
# project, no network. The cluster is created in a temp dir and
# destroyed on exit.
#
# Override the binary location with PG_BIN=/path/to/bin if needed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

if [[ -z "${PG_BIN:-}" ]]; then
  if command -v pg_ctl >/dev/null 2>&1; then
    PG_BIN="$(dirname "$(command -v pg_ctl)")"
  else
    for candidate in /opt/homebrew/opt/postgresql@{17,16,15}/bin /usr/local/opt/postgresql@{17,16,15}/bin /usr/lib/postgresql/*/bin; do
      if [[ -x "$candidate/pg_ctl" ]]; then PG_BIN="$candidate"; break; fi
    done
  fi
fi

if [[ -z "${PG_BIN:-}" || ! -x "$PG_BIN/pg_ctl" ]]; then
  echo "error: Postgres binaries not found. Install postgresql (15+) or set PG_BIN." >&2
  exit 1
fi

PORT="${RLS_PORT:-54399}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/propittu-rls.XXXXXX")"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust --no-instructions >/dev/null

# TCP on loopback only; unix sockets disabled (macOS caps socket path length).
"$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/postgres.log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

PSQL=("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "→ Supabase shim"
"${PSQL[@]}" -f "$HERE/supabase_shim.sql"

for migration in "$MIGRATIONS"/*.sql; do
  echo "→ $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

echo "→ RLS test suite"
# -t -A suppresses psql's empty result tables so only PASS/FAIL lines show.
"${PSQL[@]}" -t -A -f "$HERE/rls_test.sql" 2>&1 \
  | sed -e 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /' -e 's/^NOTICE:  /  /' \
  | grep -v -E '^[[:space:]]*$'
