# Historial de mejoras — Fiscalio

> Cada entrada representa una mejora o feature completada, con su commit de referencia donde quedó estable.
> Las entradas vienen de `PLANNING.md` una vez que la tarea está commiteada y funcionando.

---

## Seguridad — Hardening general (Mar 2026)

**Commit estable:** `46bd66f`

- Rutas `/debug/parser` y `/debug/update-dev` eliminadas (ejecutaban código shell sin autenticación)
- Rate limiting en `POST /api/login`: 5 intentos/min por IP → 429 con mensaje claro
- `APP_ENV=production` y `APP_DEBUG=false` aplicados en servidor (evita stack traces públicos)
- Middleware `AgentSecret` (commit `6ae80f9`): rutas `/api/agent/*` protegidas con `X-Agent-Secret` + `hash_equals`
- `certificate` y `private_key` ocultos en `Business.$hidden`
- Limpieza de DB: 20 businesses faker + 40 sat_requests basura + 6 usuarios de prueba eliminados

---

## Módulo Documentos SAT — CSF + Opinión 32-D (Mar 2026)

**Commit estable:** `3d75e10`

- Migración `sat_documents` table (MySQL): rfc, type [csf|opinion_32d], file_path, file_size, requested_at
- Modelo `SatDocument.php` + controller `SatDocumentController.php`
- Rutas: `GET /api/sat-documents`, `GET /api/sat-documents/{id}/download` (auth), `POST /api/agent/upload-document` (sin auth)
- PDFs guardados en `storage/app/sat_docs/{rfc}/`
- Scraper (`agent/scraper_sat.js`): upload al API + logout SAT preventivo después de cada documento (non-fatal)
- Frontend: `SatDocumentsPage.tsx` — historial de docs por RFC, botones Descargar + Robot FIEL
- Sidebar "Docs SAT" en sección Herramientas de InvoicesPage
- `agent/` está en `.gitignore` — cambios al scraper se despliegan manualmente al MiniPC

**Fixes al scraper (desplegados manualmente Mar 5 2026):**
- Instalado `chromium` (Debian) en container `fiscalio-agent`
- `.env` del container: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- `scraper_sat.js`: `import 'dotenv/config'`, auto-detect headless, soporte `executablePath`, `--disable-dev-shm-usage`
- CSF descarga y sube al API correctamente verificado
- 32-D: login funciona pero PDF no aparece (pendiente investigar botón en portal)

---

## 2026-03-05 — Optimización módulo de facturas (velocidad y filtros)
**Commit:** `54dba27`
- Migración con índices en `tipo`, `es_cancelado`, compuestos `(rfc_emisor, fecha_fiscal)` y `(rfc_receptor, fecha_fiscal)`
- `InvoiceController`: extraído `buildCfdiQuery()`, reemplazado `whereYear`/`whereMonth` con rangos `BETWEEN` para usar índices
- `InvoicesPage`: debounce 400ms en búsqueda (evita API call por cada tecla)

---

## 2026-03-05 — Backfill cfdi_payments para REPs existentes
**Commit:** `ae541a1`

- **Causa raíz:** REPs importadas antes de que existiera la tabla `cfdi_payments` → `pagosPropios` siempre vacío → matching de REPs no funciona
- Nuevo comando `cfdi:backfill-payments`: lee XML desde `path_xml` (fallback a `xml_data` JSON), popula `cfdi_payments` con `firstOrCreate`
- Soporta `--rfc=` para backfill selectivo y `--dry-run` para inspección previa
- Ejecutado en producción: 1,732 REPs de César García → 2,755 pagos insertados (0 errores)
- Comando disponible para otras empresas: `php artisan cfdi:backfill-payments` (sin `--rfc` = todas las empresas)

---

## 2026-03-05 — Conciliación inteligente: REPs, SPEI, aprendizaje
**Commits:** `5806b45`, `31e7f14`

- **Bug fix crítico:** REPs ahora matchean por `pagosPropios` (uuid_pago = rep.uuid). 1 REP que cubre N facturas suma total correctamente.
- **Extracción SPEI:** "POR ORDEN DE" / "AL BENEF" → nombre contraparte; RFC formato mexicano detectado en descripción
- **Confidence mejorado:** patrón aprendido → verde; RFC/nombre en desc + ≤10d → verde; monto exacto → mínimo amarillo
- **Aprendizaje:** al confirmar manualmente → guarda keyword+RFC en `reconciliation_patterns`; siguiente match → verde automático
- **UI:** REPs muestran UUIDs de facturas relacionadas en chips morados
- **Migration idempotente:** `Schema::hasTable` evita error si tabla ya existe

---

## 2026-03-05 — Mejoras UX conciliación + fix autodeploy definitivo
**Commits:** `e824f30`, `e9260be`

- `MovementReconcileRow`: descripción truncada a 65 chars con tooltip completo al hover
- `MovementReconcileRow`: borde izquierdo de color por confianza (verde/amarillo/rojo/transparente)
- `ReconciliationPage`: barra de progreso usa `reconciled_count` real del API; se actualiza en tiempo real al conciliar/desvincular
- `BankStatementController`: `withCount reconciled_count` (cfdi_id IS NOT NULL)
- Fix autodeploy definitivo: cron usa `bash script.sh` — ya no depende del bit `+x`

---

## 2026-03-05 — Fix parser Banamex: duplicación cargo/abono
**Commits:** `ba2ab1b` (última sesión)

- Lógica de asignación cambiada a midpoints entre columnas (cada píxel pertenece a exactamente una columna)
- Fix cargo==abono artifact PDF de sucursales
- Fix saldo final: parser exige decimales, controller calcula desde movimientos
- Fix Route [login] → Handler.php siempre retorna 401 JSON
- Fix autodeploy.sh permisos de ejecución en servidor
- Confirmado funcionando en producción por usuario

---

## 2026-03-05 — Fix módulo bancario Banamex (sesión completa)
**Commits:** `8665c7f` → `9bb120c` → `cd6aa35`

- **413 en upload PDF:** `nginx/render.conf` → `client_max_body_size 50M`; PHP upload limits en Dockerfile
- **RouteNotFoundException:** `Authenticate.php` siempre retorna `null` (uploads multipart no son JSON)
- **Nginx sin rebuild:** symlink `Dockerfile` → `render.conf` del volumen; puerto 10000 hardcodeado
- **Permisos storage:** autodeploy restaura `www-data` después de `git reset --hard`
- **Autodeploy en git:** `scripts/autodeploy.sh` trackeado en repo; cron apunta al repo
- **Parser Banamex cargos incorrectos:** filtro `SALDO not in text` reemplazado por detección exacta de filas estructurales (`SALDO ANTERIOR` / `SALDO AL DD`)
- **Skills actualizados:** `/deploy`, `/migrate`, `/restart` reflejan arquitectura real
- **CLAUDE.md limpiado:** eliminadas todas las referencias a 2 DBs, sat-api-app-dev, MariaDB

---

## 2026-03-04 07:55 — Dashboard móvil responsive
**Commit:** `2735a68`

- `DashboardPage.tsx`: sidebar `hidden md:flex`, header móvil con badge SAT activo/inactivo
- Contenido desktop `hidden md:flex`; móvil `md:hidden` con 3 pestañas: Inicio, Clientes, Ajustes
- FAB verde fijo (abre drawer nuevo cliente) + barra navegación inferior 4 tabs
- `RecentRequests.tsx`: prop `compact` → tarjetas simples en móvil

---

## 2026-03-03 22:18 — Diagnóstico de cobertura SAT + correcciones runner
**Commit:** `baad83c`

- Nueva tabla `business_notes` + modelo `BusinessNote` + comando `sat:analyze-coverage`
- Solo reporta problemas reales: `wrong_passphrase`, `certificate_invalid`, `duplicate_request`, `server_error`
- Panel "Diagnóstico de Cobertura SAT" en `ProvisionalControlPage.tsx` (solo si hay notas)
- `SatRunnerCommand.php`: optimistic lock (`WHERE attempts = X`) para evitar duplicados concurrentes
- "Solicitudes de por vida" → reclasificado como colisión de duplicados, runner hace retry en 5 min
- Endpoints: `GET /clients/{rfc}/notes`, `POST /clients/notes/{noteId}/resolve`

---

## 2026-03-04 19:50 — Optimización servidor: CPU 100% → 0.15%, disco 73GB → 45GB
**Commit:** `d24f2de`

- Descubierto: 3 runners de SAT corriendo simultáneamente (fiscalio-runner + sat-api-app + sat-api-app-dev via supervisord)
- Quitado `[program:sat-runner]` de `supervisord.conf` — solo fiscalio-runner lo maneja
- `db:backup` + `db:health-check` con `withoutOverlapping()` en Kernel.php
- Detenido `fiscalio-runner-dev` y `sat-api-app-dev` (usan Fiscalio-Test, no Fiscalio), `restart=no`, intactos para uso futuro
- Jobs stuck de 170h eliminados al reiniciar containers
- Limpieza disco: 27GB build cache Docker, 4 backups extra, DBs obsoletas, logs, mysql_data backup
- Resultado: load average 3.66 → 0.15, disco 73GB → 45GB, CPU ~0%

---

## 2026-03-04 09:03 — Auto-deploy + rescate módulo conciliación bancaria
**Commit:** `4c4a055`

- Módulo de conciliación bancaria rescatado del servidor y subido a GitHub (`main`)
  - `ReconciliationController.php`, `ReconciliationPage.tsx`, `ConfidenceBadge.tsx`, `MovementReconcileRow.tsx`
  - Migración: campos `confidence` + `reconciled_at` en `bank_movements`
- Servidor reseteado limpio a `origin/main`
- Script `/home/fiscalio/fiscalio-autodeploy.sh`: cron cada 1 min, detecta commits nuevos en origin/main → `git reset --hard` + `artisan optimize:clear` + `artisan migrate --force`
- Log en `/home/fiscalio/Fiscalio/autodeploy.log` (máx 500 líneas)

---

## 2026-03-04 19:23 — Health-check automático + db:restore
**Commit:** `7889b7f`

- `DatabaseHealthCheck.php`: corre cada 15 min, guarda snapshot de `businesses/cfdis`. Si detecta `businesses=0` vs snapshot previo → auto-restaura desde backup más reciente + log crítico
- `DatabaseRestore.php`: restaura manualmente (backup más reciente o `--backup=nombre`), crea backup de seguridad pre-restore
- `Kernel.php`: `db:health-check` agendado cada 15 min con `withoutOverlapping()`
- Protección para entorno dev+prod compartido: recuperación automática en ≤15 min ante borrado accidental

---

## 2026-03-04 (sesión) — Sincronizar datos de prod en dev
**Commit:** `e2a07aa` (branch `dev`)

- `ui/vercel.json` en branch `dev`: cambiado de `api-dev.fiscalio.cloud` → `api.fiscalio.cloud`
- Dev Vercel preview ahora ve los mismos clientes, facturas y datos que producción

---

## 2026-03-04 — Fix error 413 en módulo bancario (upload PDF)
**Commit:** `8665c7f`

- `nginx/render.conf`: agregado `client_max_body_size 20M` (defecto nginx era 1MB)
- `docker/entrypoint.sh`: configura `upload_max_filesize=20M` y `post_max_size=20M` al arrancar
- Causa: PDFs bancarios > 1MB → el servidor rechazaba con HTTP 413

---

## 2026-03-03 22:49 — Fix duplicados SAT + manejo colisiones
**Commit:** `cd19329`

- Prevención de submissions duplicadas desde el frontend
- Manejo correcto del error de colisión en el backend
- Runner reclasifica colisiones como `duplicate_request` en vez de error fatal

---
