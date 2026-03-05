---
name: migrate
description: Run Laravel database migrations on the production server (sat-api-app). Asks for confirmation before running.
argument-hint: "confirm"
allowed-tools: Bash
---

# Run Migrations — Fiscalio

Solo existe **un container y una base de datos**: `sat-api-app` con SQLite en `/var/www/Base_datos/database.sqlite`.

## Proceso

### 1. Pedir confirmación
Mostrar al usuario qué migraciones hay pendientes primero:
```bash
ssh fiscalio-server "docker exec sat-api-app php artisan migrate:status 2>&1 | grep Pending"
```

Preguntar: "¿Confirmas correr las migraciones en producción?"

### 2. Correr migraciones
Solo tras confirmación explícita:
```bash
ssh fiscalio-server "docker exec sat-api-app php artisan migrate --force 2>&1"
```

### 3. Reportar
- Mostrar output completo
- Si falla: mostrar error y detenerse — NO hacer rollback automático

## Reglas
- Nunca correr `migrate:rollback` en producción
- Si la migración falla a medias: reportar qué corrió y qué falló, esperar instrucciones del usuario
- Las migraciones nuevas deben usar columnas `nullable` o con `default` para no romper datos existentes
