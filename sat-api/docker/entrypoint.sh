#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint..."

# 1. Preparar almacenamiento persistente
mkdir -p /var/www/storage/app/public
mkdir -p /var/www/storage/framework/{cache,sessions,views}
mkdir -p /var/www/storage/logs
mkdir -p /var/www/bootstrap/cache

# 2. Configurar SQLite (WAL mode para evitar bloqueos)
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Configurando base de datos SQLite..."
  mkdir -p "$(dirname "$DB_DATABASE")"
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 3. Permisos
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 4. Optimizaciones de Laravel
echo "==> Optimizando Laravel..."
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

# 5. Ejecutar migraciones si se solicita
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "==> Ejecutando migraciones..."
  php artisan migrate --force || true
fi

# 6. ✅ GESTIÓN DINÁMICA DEL PUERTO (Segura)
# Render inyecta $PORT. Si no existe (local), usamos 10000.
REAL_PORT=${PORT:-10000}
echo "==> Configurando Nginx para escuchar en puerto: $REAL_PORT"

# Reemplazamos ${PORT} por el valor real usando sed (más seguro que envsubst en nginx)
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# Validamos que la configuración de Nginx sea correcta antes de seguir
nginx -t || { echo "ERROR: Configuración de Nginx inválida"; exit 1; }

# 7. Lanzar Supervisor
echo "==> Arrancando Supervisor (Nginx + PHP-FPM)..."
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
