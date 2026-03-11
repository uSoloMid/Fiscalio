#!/bin/bash
# Auto-deploy Fiscalio — tracked in git (scripts/autodeploy.sh)
# Cron en el servidor apunta a este archivo directamente.
# Cualquier cambio aquí se aplica en el siguiente deploy.
set -e

REPO_DIR="/home/fiscalio/Fiscalio"
LOG_FILE="$REPO_DIR/autodeploy.log"
MAX_LOG_LINES=500

cd "$REPO_DIR"

# Detect current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

git fetch origin "$CURRENT_BRANCH" --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$CURRENT_BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nuevo commit detectado: $LOCAL -> $REMOTE" >> "$LOG_FILE"

# 1. Ceder ownership a fiscalio para que git pueda resetear
docker exec sat-api-app chown -R 1000:1000 /var/www/storage /var/www/bootstrap/cache >> "$LOG_FILE" 2>&1 || true

# 2. Pull
git reset --hard "origin/$CURRENT_BRANCH" >> "$LOG_FILE" 2>&1

# Restaurar permisos de ejecución (git reset --hard los quita)
chmod +x "$REPO_DIR/scripts/autodeploy.sh"

# 3. Restaurar ownership a www-data para que PHP-FPM pueda escribir logs/cache
docker exec sat-api-app chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache >> "$LOG_FILE" 2>&1 || true

# 4. Recargar nginx (aplica cambios de render.conf sin downtime)
docker exec sat-api-app nginx -s reload >> "$LOG_FILE" 2>&1 || true

# 5. Limpiar caches de Laravel
docker exec sat-api-app php artisan optimize:clear >> "$LOG_FILE" 2>&1

# 6. Migraciones
docker exec sat-api-app php artisan migrate --force >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy completado OK" >> "$LOG_FILE"

tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
