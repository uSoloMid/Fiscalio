#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint Profesional..."

# 1. Preparar almacenamiento
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache
mkdir -p /var/run/php # Para el socket de PHP

# 2. Configurar SQLite
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Configurando SQLite..."
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 3. Permisos de archivos y del socket
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache /var/run/php
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 4. Optimizaciones Laravel
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true

# 5. ✅ ELIMINAR PUERTO 9000 (Configurar PHP para usar Socket)
# Esto hace que el puerto 9000 desaparezca y Render no se confunda
sed -i 's/listen = 9000/listen = \/var\/run\/php\/php-fpm.sock/g' /usr/local/etc/php-fpm.d/www.conf
echo "listen.owner = www-data" >> /usr/local/etc/php-fpm.d/www.conf
echo "listen.group = www-data" >> /usr/local/etc/php-fpm.d/www.conf
echo "listen.mode = 0660" >> /usr/local/etc/php-fpm.d/www.conf

# 6. ✅ GESTIÓN DEL PUERTO DE NGINX
REAL_PORT=${PORT:-10000}
echo "==> Configurando Nginx en puerto: $REAL_PORT"
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# 7. Arrancar Supervisor
echo "==> ¡Despegue!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
