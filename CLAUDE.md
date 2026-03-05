# Fiscalio — Contexto para Claude Code

## Propósito del proyecto
Sistema de gestión fiscal mexicano. Descarga, clasifica y audita CFDIs del SAT.
Multi-cliente con controles provisionales, conciliación bancaria y scraper SAT.

## Arquitectura
- **Frontend:** React 19 + TypeScript + Vite + Tailwind → desplegado en Vercel
- **Backend:** Laravel 10 + PHP 8.3 → Docker en Mini PC Linux (Ubuntu)
- **Base de datos:** SQLite única compartida (`/c/Fiscalio/Base_datos/database.sqlite`)
- **Scraper SAT:** Node.js + Puppeteer (`/c/Fiscalio/agent/`)
- **Parser bancario:** Python + pdfplumber (`/c/Fiscalio/bank_parser/`)
- **Acceso al servidor:** `ssh fiscalio-server` (alias en ~/.ssh/config, vía Tailscale)

## Containers en el MiniPC

Un solo container activo:

| Container | Puerto | URL externa |
|-----------|--------|-------------|
| `sat-api-app` | 10000 | `api.fiscalio.cloud` |

Tanto el frontend de `main` (prod) como el de `dev` (preview Vercel) apuntan al **mismo backend y la misma base de datos**.

## Flujo de trabajo Git

```
feature/fix → commit a dev → merge inmediato a main (producción)
```

- **Todo trabajo va a `dev` primero** — nunca commitear directo a `main`
- El merge a `main` se hace inmediatamente después de commitear a `dev` (no hay staging prolongado)
- Al inicio de sesión: `git checkout dev && git pull origin dev && git pull origin main`

## URLs del proyecto

| Entorno | Frontend | API |
|---------|----------|-----|
| Producción | `https://fiscalio.cloud` | `https://api.fiscalio.cloud` |
| Dev preview | Vercel preview (branch `dev`) | `https://api.fiscalio.cloud` (misma) |

## Directorios clave
| Ruta | Descripción |
|------|-------------|
| `sat-api/` | Laravel API backend |
| `ui/` | React frontend |
| `agent/` | Scraper Puppeteer SAT |
| `bank_parser/` | Parser PDF estados de cuenta |
| `Base_datos/` | Almacenamiento SQLite |
| `docs/` | Documentación |

## Archivos backend importantes
- `sat-api/routes/api.php` — 40+ endpoints API
- `sat-api/app/Http/Controllers/InvoiceController.php` — gestión CFDIs (37KB)
- `sat-api/app/Http/Controllers/ProvisionalControlController.php` — resúmenes fiscales (41KB)
- `sat-api/app/Console/Commands/SatRunnerCommand.php` — daemon background (con optimistic lock)
- `sat-api/app/Services/SatDescargaMasivaService.php` — descarga masiva SAT
- `sat-api/app/Console/Commands/AnalyzeCoverageCommand.php` — diagnóstico FIEL/cobertura
- `sat-api/app/Models/BusinessNote.php` — notas diagnóstico por RFC

## Archivos frontend importantes
- `ui/src/pages/DashboardPage.tsx` — dashboard principal (desktop + mobile responsive)
- `ui/src/pages/InvoicesPage.tsx` — listado/filtrado CFDIs
- `ui/src/pages/ProvisionalControlPage.tsx` — resúmenes fiscales + Diagnóstico SAT
- `ui/src/pages/ProvisionalExplorers.tsx` — drill-down PPD/REP
- `ui/src/pages/SatRequestsHistoryPage.tsx` — historial solicitudes SAT
- `ui/src/components/RecentRequests.tsx` — solicitudes recientes (prop `compact` para móvil)
- `ui/src/App.tsx` — Router + estado (localStorage para RFC activo)
- `ui/src/models.ts` — interfaces TypeScript
- `ui/src/services.ts` — llamadas API centralizadas

## Tech Stack
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React + TypeScript | 19.2 / 5.9 |
| Build | Vite | 7.2.4 |
| CSS | Tailwind | 4.1.18 |
| Backend | Laravel | 8.62+ |
| PHP | PHP-FPM | 8.3 |
| DB | SQLite | 3 |
| Auth | Sanctum | 2.11+ |
| SAT libs | phpcfdi/* | 0.5+ |
| Scraper | Puppeteer | 21.5.0 |
| Parser | pdfplumber | — |

## Funcionalidades principales
1. **Descarga CFDI** — SAT Descarga Masiva vía phpcfdi, en lotes de 6 meses
2. **Controles Provisionales** — PUE, PPD, REP con desglose de cubetas
3. **Auditoría de deducibilidad** — auto-flag gastos no deducibles, overrides manuales
4. **Conciliación bancaria** — parsing PDF BBVA, Banamex, Inbursa, Banbajío
5. **Scraper SAT** — Constancia Fiscal (CSF), Opinión de Cumplimiento (32-D)
6. **Multi-cliente** — Workspaces, Grupos, Etiquetas, gestión FIEL

## Esquema de base de datos (SQLite)
Tablas principales: `cfdis`, `sat_requests`, `businesses`, `accounts`,
`bank_statements`, `bank_movements`, `users`, `workspaces`, `groups`, `tags`, `business_notes`

## Despliegue
- **Branch `main`** → producción Vercel (frontend) + Mini PC Docker (backend)
- **Branch `dev`** → preview Vercel auto-deploy (misma API/DB que prod)
- Docker Compose: monta `Base_datos/` y `bank_parser/` en el contenedor sat-api
- Auto-deploy: script cron en el servidor detecta commits nuevos en `origin/main` → `git reset --hard` + `nginx -s reload` + `artisan optimize:clear` + `artisan migrate --force`

## Notas técnicas importantes
- **SAT sync threshold:** 6 horas (re-sync automático)
- **Optimistic lock en SatRunnerCommand:** usa `UPDATE WHERE attempts = X` para evitar solicitudes duplicadas concurrentes
- **"Solicitudes de por vida":** es colisión de duplicados, NO límite real del SAT → runner hace retry en 5 min
- **`business_notes`:** tabla para diagnósticos persistentes por RFC (credencial inválida, cert caducado, etc.)
- **Memory limit:** infinite para extracción de XMLs grandes
- **Backups DB:** automatizados, retiene 3 más recientes + backup permanente
- **`config:cache` y `route:cache` desactivados** en entrypoint.sh — solo hay 1 container pero el volumen es compartido con git y no queremos archivos de cache commiteados

## Reglas para agentes IA
1. **Todo trabajo nuevo va a `dev`** — nunca commitear directo a `main`
2. **No tocar `SatRunnerCommand.php` ni `XmlProcessorService.php`** sin permiso explícito
3. **Nunca correr `migrate:rollback`** en producción
4. **`API_BASE_URL` en `ui/src/api/config.ts` debe ser `''`** — el frontend usa proxy Vercel para evitar CORS
5. **Al inicio de sesión:** `git checkout dev && git pull origin dev && git pull origin main`

## Comandos útiles
```bash
# Análisis de cobertura SAT (desde el servidor)
docker exec sat-api-app php artisan sat:analyze-coverage --clear

# SSH al servidor
ssh fiscalio-server

# Dev frontend
cd ui && npm run dev

# Build frontend
cd ui && npm run build

# Migraciones
docker exec sat-api-app php artisan migrate --force

# Reiniciar container (avisar al usuario antes)
docker restart sat-api-app
```

---

## Workflow de Planning — OBLIGATORIO para toda IA

Antes de empezar cualquier tarea no trivial, y durante su ejecución:

### 1. Al iniciar una tarea
Abre `docs/PLANNING.md` y escribe la entrada con:
- Nombre de la tarea
- Lista de pasos a seguir (pueden ser estimados al inicio)
- Archivos que se van a modificar

### 2. Durante la tarea
Actualiza `docs/PLANNING.md` conforme avanzas:
- Marca pasos completados con `[x]`
- Añade notas de decisiones técnicas relevantes
- Ajusta pasos si el plan cambia

### 3. Al terminar y commitear
1. Mueve la entrada de `docs/PLANNING.md` a `docs/HISTORY.md`
   - Añade el hash del commit donde quedó estable
   - Deja solo el resumen final (sin los checkboxes internos)
2. Deja `docs/PLANNING.md` con `_No hay tarea activa actualmente._`

### Reglas
- **Una sola tarea activa** en PLANNING.md a la vez
- **No borrar** entradas de HISTORY.md — es el registro permanente
- El historial anterior está en `docs/HISTORY.md`
