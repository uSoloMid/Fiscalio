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
echo "==> Limpiando caché profunda..."
php artisan config:clear || true
php artisan route:clear || true
php artisan cache:clear || true
php artisan view:clear || true

echo "==> Re-generando caché de producción..."
php artisan config:cache || true
php artisan route:cache || true

# 4.1. Migraciones (Auto-Schema)
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "==> Ejecutando migraciones..."
    php artisan migrate --force
fi

# 5. ✅ CONFIGURACIÓN DE PHP-FPM (Unix Socket)
echo "==> Configurando PHP-FPM por Unix Socket..."

mkdir -p /var/run/php
chown -R www-data:www-data /var/run/php
chmod 755 /var/run/php

SOCK="/var/run/php/php-fpm.sock"

# 1) Debug: listar todos los listen actuales (antes)
echo "==> PHP-FPM listen (antes):"
grep -R "^\s*listen\s*=" -n /usr/local/etc/php-fpm.d 2>/dev/null || true

# 2) Forzar socket en TODOS los pools (no solo www.conf)
for f in /usr/local/etc/php-fpm.d/*.conf; do
  [ -f "$f" ] || continue
  if grep -q "^\s*listen\s*=" "$f"; then
    sed -i "s|^\s*listen\s*=.*|listen = $SOCK|g" "$f"
  fi
done

# 3) Asegurar permisos del socket en el pool principal (si existe www.conf)
if [ -f /usr/local/etc/php-fpm.d/www.conf ]; then
  grep -q '^listen.owner' /usr/local/etc/php-fpm.d/www.conf \
    && sed -i 's|^listen.owner = .*|listen.owner = www-data|g' /usr/local/etc/php-fpm.d/www.conf \
    || echo "listen.owner = www-data" >> /usr/local/etc/php-fpm.d/www.conf

  grep -q '^listen.group' /usr/local/etc/php-fpm.d/www.conf \
    && sed -i 's|^listen.group = .*|listen.group = www-data|g' /usr/local/etc/php-fpm.d/www.conf \
    || echo "listen.group = www-data" >> /usr/local/etc/php-fpm.d/www.conf

  grep -q '^listen.mode' /usr/local/etc/php-fpm.d/www.conf \
    && sed -i 's|^listen.mode = .*|listen.mode = 0660|g' /usr/local/etc/php-fpm.d/www.conf \
    || echo "listen.mode = 0660" >> /usr/local/etc/php-fpm.d/www.conf
fi

# 4) Debug: listar listens después
echo "==> PHP-FPM listen (después):"
grep -R "^\s*listen\s*=" -n /usr/local/etc/php-fpm.d 2>/dev/null || true

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
echo "==> Puertos escuchando (pre-supervisord):"
ss -lntup || true

echo "==> ¡Sistema LISTO!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
