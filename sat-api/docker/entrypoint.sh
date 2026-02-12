#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint - VERSIÓN ESTABLE"

# 1. Limpiar rastro de puertos anteriores de forma segura
# En lugar de borrar archivos, modificamos para que PHP escuche solo internamente
# Esto evita errores de "missing pool" en PHP-FPM
sed -i 's/listen = .*/listen = 127.0.0.1:9000/g' /usr/local/etc/php-fpm.d/www.conf
if [ -f /usr/local/etc/php-fpm.d/zz-docker.conf ]; then
    sed -i 's/listen = .*/listen = 127.0.0.1:9000/g' /usr/local/etc/php-fpm.d/zz-docker.conf
fi

# 2. Preparar almacenamiento
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache

# 3. Configurar SQLite
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Preparando base de datos SQLite..."
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 4. Permisos
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 5. Optimizaciones Laravel
echo "==> Optimizando Laravel..."
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true

# 6. Configurar puerto de Nginx
REAL_PORT=${PORT:-10000}
echo "==> Configurando Nginx en puerto: $REAL_PORT"
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# 7. Despegue
echo "==> ¡Sistema LISTO!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
