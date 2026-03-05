---
name: restart
description: Safely restart the sat-api-app Docker container on the production server. Fixes storage permissions first to avoid git reset failures. Use after Dockerfile or entrypoint.sh changes.
argument-hint: "confirm"
allowed-tools: Bash
---

# Restart sat-api-app — Fiscalio

Necesario cuando cambia `Dockerfile` o `entrypoint.sh` (nginx reload no es suficiente).
Para cambios solo de nginx conf o PHP/Laravel: el autodeploy ya hace `nginx -s reload` automático.

## ⚠️ Advertir al usuario antes de proceder

El restart causa ~5-10 segundos de downtime. Preguntar confirmación si no se dio explícitamente.

## Pasos

### 1. Arreglar permisos de storage
Docker corre como root y crea archivos en el volumen con owner `root`, lo que bloquea `git reset --hard`.
Hay que cambiarlos al UID del usuario del servidor (1000):

```bash
ssh fiscalio-server "docker exec sat-api-app chown -R 1000:1000 /var/www/storage /var/www/bootstrap/cache"
```

### 2. Asegurar que el repo está en main actualizado
```bash
ssh fiscalio-server "cd /home/fiscalio/Fiscalio && git reset --hard origin/main"
```

### 3. Reiniciar el container
```bash
ssh fiscalio-server "docker restart sat-api-app"
```

### 4. Verificar que levantó correctamente (esperar ~5s)
```bash
ssh fiscalio-server "sleep 6 && docker ps | grep sat-api-app && docker exec sat-api-app nginx -t"
```

### 5. Confirmar config activa
```bash
ssh fiscalio-server "docker exec sat-api-app grep -E 'client_max|listen' /etc/nginx/conf.d/default.conf"
```

## Qué esperar en los logs al arrancar bien
```
==> Nginx conf test:
nginx: configuration file /etc/nginx/nginx.conf syntax is ok
==> Port listening check:
    listen 0.0.0.0:10000 default_server;
==> ¡Sistema LISTO!
```

## Reglas
- Siempre arreglar permisos ANTES del restart (paso 1)
- Si `docker restart` falla: revisar logs con `docker logs sat-api-app --tail 50`
- No usar `docker-compose down && up` a menos que el usuario lo pida explícitamente (más disruptivo)
