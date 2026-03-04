# Fiscalio — Contexto para Claude Code

## Propósito del proyecto
Sistema de gestión fiscal mexicano. Descarga, clasifica y audita CFDIs del SAT.
Multi-cliente con controles provisionales, conciliación bancaria y scraper SAT.

## Arquitectura
- **Frontend:** React 19 + TypeScript + Vite + Tailwind → desplegado en Vercel
- **Backend:** Laravel 10 + PHP 8.3 → Docker en Mini PC Linux (Ubuntu)
- **Base de datos:** SQLite (`/c/Fiscalio/Base_datos/database.sqlite`)
- **Scraper SAT:** Node.js + Puppeteer (`/c/Fiscalio/agent/`)
- **Parser bancario:** Python + pdfplumber (`/c/Fiscalio/bank_parser/`)
- **Acceso al servidor:** Tailscale IP `100.123.107.90`, SSH

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
- **Branch `dev`** → preview Vercel auto-deploy
- Docker Compose: monta `Base_datos/` y `bank_parser/` en el contenedor sat-api

## Notas técnicas importantes
- **SAT sync threshold:** 6 horas (re-sync automático)
- **Optimistic lock en SatRunnerCommand:** usa `UPDATE WHERE attempts = X` para evitar solicitudes duplicadas concurrentes
- **"Solicitudes de por vida":** es colisión de duplicados, NO límite real del SAT → runner hace retry en 5 min
- **`business_notes`:** tabla para diagnósticos persistentes por RFC (credencial inválida, cert caducado, etc.)
- **Memory limit:** infinite para extracción de XMLs grandes
- **Backups DB:** automatizados, retiene 3 más recientes + backup permanente

## Comandos útiles
```bash
# Análisis de cobertura SAT (desde el servidor)
docker exec sat-api php artisan sat:analyze-coverage --clear

# SSH al servidor
ssh user@100.123.107.90   # vía Tailscale

# Dev frontend
cd ui && npm run dev

# Build frontend
cd ui && npm run build
```
