#!/usr/bin/env bash
set -e

# Render Disk recomendado: /var/www/storage
mkdir -p /var/www/storage/app/public
mkdir -p /var/www/storage/framework/{cache,sessions,views}
mkdir -p /var/www/storage/logs
mkdir -p /var/www/bootstrap/cache

# Si usas SQLite en storage:
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  mkdir -p "$(dirname "$DB_DATABASE")"
  touch "$DB_DATABASE"
  
  # Optimizaciones SQLite para concurrencia (Web + Worker)
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL;" || true
  sqlite3 "$DB_DATABASE" "PRAGMA synchronous=NORMAL;" || true
  sqlite3 "$DB_DATABASE" "PRAGMA busy_timeout=10000;" || true
  sqlite3 "$DB_DATABASE" "PRAGMA wal_checkpoint(TRUNCATE);" || true
fi

# Permisos recursivos robustos
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# Laravel optimizations
php artisan storage:link --force || true
php artisan config:clear || true
php artisan route:clear || true
php artisan view:clear || true

php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

# Migraciones automáticas
if [ "$RUN_MIGRATIONS" = "true" ]; then
  php artisan migrate --force || true
fi

if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
