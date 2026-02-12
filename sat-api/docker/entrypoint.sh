#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint - MODO EXCLUSIVO"

# 1. BORRAR EL TRAIDOR: Eliminamos la config que abre el puerto 9000 al exterior
rm -f /usr/local/etc/php-fpm.d/zz-docker.conf || true

# 2. Configurar PHP para que solo hable con Nginx internamente
# Creamos una config limpia que solo escucha en 127.0.0.1
echo "[www]
listen = 127.0.0.1:9000" > /usr/local/etc/php-fpm.d/zz-render.conf

# 3. Preparar almacenamiento
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache

# 4. Configurar SQLite
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Preparando base de datos SQLite..."
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 5. Permisos
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 6. Optimizaciones Laravel
echo "==> Optimizando Laravel..."
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true

# 7. Configurar Nginx con el puerto de Render
REAL_PORT=${PORT:-10000}
echo "==> Abriendo ventanilla única en puerto: $REAL_PORT"
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# 8. Despegue
echo "==> ¡Arrancando Motores!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
