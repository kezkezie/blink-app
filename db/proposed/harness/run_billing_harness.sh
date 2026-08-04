#!/usr/bin/env bash
# ============================================================================
# Ephemeral local-Postgres harness for the PROPOSED billing RPCs (rev-4).
# Spins up a throwaway Postgres cluster (initdb), applies the seed + proposed
# migration, runs the 25-case verification matrix (deterministic cases in
# billing_harness.sql; concurrency cases 16-17 as real parallel connections
# here), then tears everything down. No remote DB is touched.
#
#   usage:  bash db/proposed/harness/run_billing_harness.sh
#   exit 0 = all cases passed; non-zero = a failure (message on stderr).
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../20260728_generation_billing_rpcs.PROPOSED.sql"
PGDATA="$(mktemp -d "${TMPDIR:-/tmp}/billing_pg.XXXXXX")"
PORT="${HARNESS_PGPORT:-54329}"
DB="billing_harness"
PSQL_BASE=(psql -h localhost -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

cleanup() {
  pg_ctl -D "$PGDATA" -w stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> initdb ephemeral cluster ($PGDATA, port $PORT)"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$PGDATA" \
  -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=$PGDATA -c fsync=off" \
  -w start >/dev/null

"${PSQL_BASE[@]}" -d postgres -c "CREATE DATABASE $DB;" >/dev/null
PSQL=("${PSQL_BASE[@]}" -d "$DB")

echo "==> apply seed + proposed migration"
"${PSQL[@]}" -f "$HERE/seed.sql" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

echo "==> run deterministic matrix (cases 1-15, 18-25)"
"${PSQL[@]}" -f "$HERE/billing_harness.sql"

echo "==> concurrency (cases 16-17): real parallel connections"
CC="10000000-0000-4000-8000-000000000abc"
JJ="20000000-0000-4000-8000-000000000abc"
"${PSQL[@]}" -c "SELECT h_seed_client('$CC', 100); SELECT h_seed_job('$JJ','$CC','conckey0000001',8,'queued','not_charged');" >/dev/null

# 16. two concurrent charges of the same (content,key)
"${PSQL[@]}" -c "SELECT outcome FROM public.claim_and_charge_image_generation('$CC','$JJ','conckey0000001',8);" >/dev/null &
"${PSQL[@]}" -c "SELECT outcome FROM public.claim_and_charge_image_generation('$CC','$JJ','conckey0000001',8);" >/dev/null &
wait
"${PSQL[@]}" -c "DO \$\$ BEGIN
  PERFORM h_assert(h_ledger_count('$JJ','charge') = 1, '16a exactly one charge ledger row under concurrency');
  PERFORM h_assert(h_balance('$CC') = 92, '16b balance deducted exactly once under concurrency');
END \$\$;"

# 17. two concurrent refunds of the same charged job
"${PSQL[@]}" -c "SELECT claim_and_refund_image_generation('$CC','$JJ','conckey0000001','safety_blocked','x');" >/dev/null &
"${PSQL[@]}" -c "SELECT claim_and_refund_image_generation('$CC','$JJ','conckey0000001','safety_blocked','x');" >/dev/null &
wait
"${PSQL[@]}" -c "DO \$\$ BEGIN
  PERFORM h_assert(h_ledger_count('$JJ','refund') = 1, '17a exactly one refund ledger row under concurrency');
  PERFORM h_assert(h_balance('$CC') = 100, '17b balance restored exactly once under concurrency');
END \$\$;"

echo "=========================================================="
echo "ALL 25 CASES PASSED"
echo "=========================================================="
