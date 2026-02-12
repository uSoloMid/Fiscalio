#!/usr/bin/env bash
set -e

echo "==> MODO AUDITORÍA TOTAL: Eliminando rastro de puertos..."

# 1. Crear carpeta para el socket con permisos correctos
mkdir -p /var/run/php
chown www-data:www-data /var/run/php

# 2. BORRAR TODA LA CONFIGURACIÓN DE PUERTOS DE PHP
# Esto garantiza que no quede ningún "9000" escondido
rm -rf /usr/local/etc/php-fpm.d/*

# 3. Crear una configuración ÚNICA y PRIVADA que usa un ARCHIVO, no un puerto
echo "[www]
user = www-data
group = www-data
listen = /var/run/php/php-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
pm = dynamic
pm.max_children = 5
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3" > /usr/local/etc/php-fpm.d/render.conf

# 4. Preparar almacenamiento y SQLite
mkdir -p /var/www/storage/app/public /var/www/storage/framework/{cache,sessions,views} /var/www/storage/logs /var/www/bootstrap/cache
if [ -n "$DB_DATABASE" ] && [[ "$DB_DATABASE" == *.sqlite ]]; then
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

# 7. Configurar Nginx para que use el ARCHIVO para hablar con PHP
REAL_PORT=${PORT:-10000}
echo "==> Único puerto público: $REAL_PORT"
sed -i "s/\${PORT}/$REAL_PORT/g" /etc/nginx/conf.d/default.conf

# 8. Despegue
echo "==> ¡Arrancando Motores!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
