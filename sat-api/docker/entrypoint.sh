#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint - MODO ESTABLE Y PRIVADO"

# 1. Preparar almacenamiento
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache

# 2. Configurar SQLite
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Preparando base de datos SQLite..."
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 3. Permisos
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 4. Optimizaciones Laravel
echo "==> Optimizando Laravel..."
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true

# 5. ✅ CAMBIAR EL CANAL DE PHP (De 9000 a 127.0.0.1:9001)
# Cambiamos el puerto en todos los archivos sin borrarlos para evitar errores status 78
find /usr/local/etc/php-fpm.d/ -type f -name "*.conf" -exec sed -i 's/listen = .*/listen = 127.0.0.1:9001/g' {} +

# 6. ✅ CONFIGURAR NGINX
REAL_PORT=${PORT:-10000}
echo "==> Abriendo ventanilla pública en puerto: $REAL_PORT"
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# 7. Despegue
echo "==> ¡Sistema LISTO y Optimizado!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
