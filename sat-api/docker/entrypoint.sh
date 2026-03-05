#!/usr/bin/env bash
set -e

echo "==> Módulos PHP instalados:"
php -m

echo "==> Iniciando Entrypoint Profesional (Debug Mode)..."
# Trigger new deploy for cache clearing

echo "==> Configurando OpenSSL Legacy Provider..."
cat <<EOF > /tmp/openssl.cnf
openssl_conf = openssl_init
[openssl_init]
providers = provider_sect
[provider_sect]
default = default_sect
legacy = legacy_sect
[default_sect]
activate = 1
[legacy_sect]
activate = 1
EOF

# Intentar encontrar la ruta de openssl.cnf y sobreescribirla
CONF_PATH=$(openssl version -d | cut -d'"' -f2)/openssl.cnf
if [ -f "$CONF_PATH" ]; then
    cp /tmp/openssl.cnf "$CONF_PATH"
    echo "    Actualizado $CONF_PATH"
else
    # Fallback
    cp /tmp/openssl.cnf /etc/ssl/openssl.cnf
    echo "    Actualizado /etc/ssl/openssl.cnf"
fi

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

# NOTA: config:cache y route:cache están desactivados intencionalmente.
# Prod y dev comparten el mismo volumen /var/www — cachear aquí sobreescribiría
# la config del otro container con settings incorrectos (ej. DB equivocada).
# Cada container lee sus env vars directamente sin cache.

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

# 6. ✅ NGINX — el symlink /etc/nginx/conf.d/default.conf → /var/www/nginx/render.conf
# ya está creado en el Dockerfile. El puerto está hardcodeado en render.conf (10000).
# Los deploys de git solo necesitan "nginx -s reload" para aplicar cambios.
echo "==> Nginx conf test:"
nginx -t || true

echo "==> Port listening check:"
grep -R "listen " -n /etc/nginx/conf.d/*.conf || true

# 7. Despegue
echo "==> Copiando Configuración Supervisor y Actualizando..."
cp -f /var/www/docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 2>/dev/null || true

echo "==> Puertos escuchando (pre-supervisord):"
ss -lntup || true

echo "==> ¡Sistema LISTO!"
if [ $# -gt 0 ]; then
    exec "$@"
else
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
fi
