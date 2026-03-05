---
name: deploy
description: Commit and push current changes to dev, then merge to main and deploy to production server. Pass 'dev' to only push to dev (no merge). Pass 'main' to merge+deploy after changes are tested.
argument-hint: "dev | main"
allowed-tools: Bash
---

# Deploy Fiscalio

## Arquitectura de deploy
- **`dev` branch** → Vercel preview automático (frontend solamente)
- **`main` branch** → Autodeploy en servidor (cron cada 1 min detecta commits nuevos)
  - Hace: `git reset --hard origin/main` + `nginx -s reload` + `artisan optimize:clear` + `artisan migrate --force`
- **Un solo container:** `sat-api-app` en `ssh fiscalio-server`
- **NUNCA** commitear directo a `main`

---

## Paso 1 — Verificar rama

Confirmar que estamos en `dev`:
```bash
git branch --show-current
```
Si estamos en `main`, cambiar a `dev` primero.

## Paso 2 — Ver cambios

```bash
git status
git diff --stat
```

## Paso 3 — Commit en dev

- Stagear archivos relevantes (nunca `.env`, nunca scripts debug `*.py` sueltos en raíz)
- Commit con mensaje descriptivo + Co-Authored-By
- `git push origin dev`

## Paso 4 — ¿Solo dev o también main?

Si $ARGUMENTS es `dev` o no se especifica: **terminar aquí**. Vercel preview se actualiza solo.

Si $ARGUMENTS es `main` (cambios probados y listos para producción):

### 4a. Merge dev → main
```bash
git checkout main
git pull origin main
git merge dev --no-edit
git push origin main
git checkout dev
```

### 4b. Esperar autodeploy (~1 min)
```bash
ssh fiscalio-server "tail -f /home/fiscalio/Fiscalio/autodeploy.log"
```
Ctrl+C cuando veas "Deploy completado OK".

### 4c. ¿Los cambios incluyen Dockerfile o entrypoint.sh?
Si sí → se necesita `docker restart`. Usar el skill `/restart` (arregla permisos antes).

## Reglas
- Nunca commitear `.env`, secrets, ni archivos `desktop.ini`
- Si el merge tiene conflictos → resolverlos manualmente, no forzar
- Si el autodeploy falla por permisos → usar el skill `/restart`
- Siempre terminar en branch `dev`
