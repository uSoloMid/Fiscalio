#!/usr/bin/env bash
set -e

echo "==> Iniciando Entrypoint Profesional (Debug Mode)..."

# 1. Preparar almacenamiento
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache

# 2. Configurar SQLite
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
  echo "==> Preparando base de datos SQLite..."
  mkdir -p "$(dirname "$DB_DATABASE")"
  touch "$DB_DATABASE"
  sqlite3 "$DB_DATABASE" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" || true
fi

# 3. Permisos de Laravel
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage /var/www/bootstrap/cache

# 4. Optimizaciones de Laravel
echo "==> Optimizando Laravel..."
php artisan storage:link --force || true
php artisan config:cache || true
php artisan route:cache || true

# 5. ✅ CONFIGURACIÓN DE PHP-FPM (Unix Socket)
echo "==> Configurando PHP-FPM por Unix Socket..."
mkdir -p /var/run/php
chown -R www-data:www-data /var/run/php
chmod 755 /var/run/php

# Asegurar que exista el pool config
if [ ! -f /usr/local/etc/php-fpm.d/www.conf ]; then
    echo '[www]
user = www-data
group = www-data
listen = /var/run/php/php-fpm.sock
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3' > /usr/local/etc/php-fpm.d/www.conf
fi

# Forzar escucha en socket
sed -i 's|^listen = .*|listen = /var/run/php/php-fpm.sock|g' /usr/local/etc/php-fpm.d/www.conf
echo "listen.owner = www-data" >> /usr/local/etc/php-fpm.d/www.conf
echo "listen.group = www-data" >> /usr/local/etc/php-fpm.d/www.conf
echo "listen.mode = 0660" >> /usr/local/etc/php-fpm.d/www.conf

# 6. ✅ CONFIGURACIÓN DE NGINX ($PORT)
REAL_PORT=${PORT:-10000}
echo "==> Usando PORT=$REAL_PORT"

# Forzar el config correcto desde el código hacia la carpeta de Nginx
cp -f /var/www/nginx/render.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true

# Reemplazar ${PORT} en TODOS los conf de nginx para no fallar
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/*.conf

# Debug: Verificar config
echo "==> Nginx conf test:"
nginx -t || true

echo "==> Port listening check:"
grep -R "listen " -n /etc/nginx/conf.d/*.conf || true

# 7. Despegue
echo "==> ¡Sistema LISTO!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
