#!/bin/sh
set -e

echo "[entrypoint] starting VibeSocial API"

# 1. Wait for the database to accept connections.
node ./docker/wait-for-db.js

# 2. Apply migrations. The app runs with synchronize=false, so schema changes
#    only ever arrive through migrations.
echo "[entrypoint] running database migrations"
node ./node_modules/typeorm/cli.js migration:run -d ./dist/database/data-source.js

# 3. Seed the first SuperAdmin when credentials are provided. The script is
#    idempotent - it exits early if a SuperAdmin already exists.
if [ -n "$BOOTSTRAP_ADMIN_EMAIL" ] && [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  echo "[entrypoint] bootstrapping administrator account"
  node ./dist/database/bootstrap/bootstrap-admin.js || \
    echo "[entrypoint] bootstrap step skipped (non-fatal)"
else
  echo "[entrypoint] no bootstrap admin credentials supplied - skipping seed"
fi

# 4. Hand over to the API process so it becomes PID 1 and receives signals.
#    A supplied command wins, which lets the platform override the start command.
if [ "$#" -gt 0 ]; then
  echo "[entrypoint] launching: $*"
  exec "$@"
fi

echo "[entrypoint] launching API"
exec node dist/main
