# Historial de mejoras — Fiscalio

> Cada entrada representa una mejora o feature completada, con su commit de referencia donde quedó estable.
> Las entradas vienen de `PLANNING.md` una vez que la tarea está commiteada y funcionando.

---

## 2026-03-13 — Conciliaciones: facturas ya vinculadas, nómina, asignación manual

**Commit estable:** pendiente

- **Facturas ya vinculadas excluidas de sugerencias:** Al calcular sugerencias, se excluyen CFDIs que ya están vinculados a otro movimiento. Si el CFDI vinculado es un REP, también se excluyen las facturas que ese REP cubre (vía `cfdi_payments`).
- **Soporte nómina (tipo N):** Facturas de nómina (Emitidas tipo N, rfc_emisor = RFC del negocio) ahora aparecen como sugerencias para movimientos de egreso.
- **Asignación manual:** Nuevo botón "Asignar manualmente" en la sidebar. Al activarse, muestra un buscador que consulta el backend por UUID, RFC o nombre. Los resultados se vinculan con confianza 'red' (manual). Nuevo endpoint `GET /api/reconciliation/search`.

---

## 2026-03-12 — Cuentas: visual feedback árbol + export/import Excel Contpaqi

**Commit estable:** `20044ec`
- Visual feedback en árbol: cuenta seleccionada con azul intenso + icono coloreado; ancestros con azul suave
- Endpoint `GET /accounts/export` genera `.xlsx` en formato Contpaqi (4 headers, columnas exactas)
- `importExcel` corregido para saltar 4 filas de header (consistente con `seedCatalog`)
- Botón de descarga exporta Excel Contpaqi en lugar de CSV
- El catálogo ya era per-cliente (by `business_id`); la duplicación era por migraciones de reset global que ya corrieron

---

## 2026-03-12 — Parser Inbursa robusto: dual-path fitz+OCR con validación aritmética

**Commit estable:** (ver commit actual)

Reescritura completa de `bank_parser/adapters/inbursa.py` para soportar cualquier PDF Inbursa.

**Estrategia dual-path:**
- Extrae carátula (SA, ABONOS, CARGOS, SF) de páginas 0-3 vía fitz, con fallback OCR
- Intenta extracción fitz → valida `SA + Σabonos - Σcargos = SF_carátula` con tolerancia 1 peso
- Si fitz falla → intenta OCR → valida → usa el que tenga menor discrepancia

**Bugs corregidos (5 en total):**
1. Carátula tomaba el ÚLTIMO número de la línea (rendimientos) en vez del PRIMERO (monto real)
2. Header de tabla (FECHA REFERENCIA CONCEPTO CARGOS…) se confundía con línea de resumen → guard `x0 < 60`
3. OCR con 0 movimientos pasaba validación vacuamente → early return en `_validate_movements`
4. Float y-offset de ~0.001px excluía montos de la fila → epsilon de 2px en `(row_top - 2) <= top`
5. `/Con Efectivo 455.00` en zona CONCEPTO se asignaba como cargo → guard `if x1 < 300: continue`
6. **Bug nuevo (esta sesión):** dos transacciones consecutivas separadas ~11.23px (< y_tolerance=12) se fusionaban en un solo anchor → el cargo de la primera sobreescrito por la segunda. Fix: detectar múltiples palabras de mes en el mismo anchor-group y dividir en sub-anchors independientes.

**Resultados:**
- Nov 2025 (11 25 INBURSA.pdf): 171 movs ✓ fitz
- Dic 2025 (EdoCuenta_Inbursa 18): 185 movs ✓ fitz (antes 177 con 50,584.50 de discrepancia en cargos)

---

## 2026-03-11 — Fix parser Inbursa — detección dinámica de columnas

**Commit estable:** `6770297`

- Bug 1: coordenadas hardcodeadas (`x1 >= 720`) nunca aplicaban en PDF A4 (~595pt) → saldo siempre 0.
- Bug 2: `_is_spei_detail_line` filtraba las líneas principales porque referencias de 10 dígitos activaban el check → casi todos los movimientos sin importes.
- Bug 3: abonos cortos asignados como cargos por ambigüedad de distancia.
- Fix: detección dinámica de columnas desde la fila cabecera CARGOS/ABONOS/SALDO; valor más a la derecha = SALDO siempre; punto medio cargo/abono como frontera exacta; filtro SPEI solo en líneas de continuación.
- Mejora: Aplicación de rangos explícitos para montos (Cargos: 351-420, Abonos: 421-500, Saldo: >500) para mayor precisión según la estructura visual del PDF.
- El PDF de Inbursa contiene 2 cuentas (principal + inversiones); corte en "SI DESEA RECIBIR PAGOS" para importar solo la principal.

---

## 2026-03-10 — Mitigación de "Error no controlado" (SAT Code 5005)

**Commit estable:** `(pendiente de hash tras push)`

- Implementado mecanismo de "Fresh Start" en `SatRunnerCommand.php`: si una solicitud falla 3 veces con error 5005, se limpia el `request_id` para forzar una nueva solicitud al SAT.
- Mejora en la UI (`RequestDetailsModal.tsx`): clasificación del error 5005 como "Saturación o Error Interno del SAT" con sugerencias específicas de reintento automático.
- `AnalyzeCoverageCommand.php` actualizado para reflejar la causa probable de los fallos de reintento en el diagnóstico de riesgos fiscales.
- Límite de 10 intentos totales antes de marcar como fallo permanente para evitar bucles infinitos en solicitudes problemáticas.

---

## 2026-03-09 — Implementación del Parser de Estados de Cuenta Inbursa

**Commit estable:** `a8a424e`

- Clasificador de bancos actualizado para detectar PDFs de Inbursa (incluyendo texto ofuscado).
- Nuevo adaptador `inbursa.py` con extracción de CLABE, periodo, saldos y movimientos.
- Soporte para conceptos multilínea y detección geométrica de columnas de montos.
- Integración en el flujo principal para generación automática de Excel.

---

## 2026-03-08 — UX Conciliación: jerarquía visual, progreso y filtros

**Commit estable:** `909f65e`

- Montos `text-base font-black` — el monto es lo primero que ve el ojo; ceros muestran "—"
- Badges de estado grandes con icono: `check_circle` verde · `pending` ámbar · `warning` rojo — distintos sin leer
- Fondos de fila: verde suave (conciliado), rojo suave (sin match)
- Descripción truncada a 40 chars con referencia como segunda línea
- Barra de progreso: franja verde + `X / Y` + porcentaje con color semáforo
- Filtros: Todas / Pendientes / Conciliadas con contador en cada tab
- Empty state cuando el filtro activo no tiene movimientos

---

## 2026-03-08 — Rediseño UX módulo Conciliación Bancaria

**Commit estable:** `21377e0`

- Selector de bancos: tarjetas expandidas al entrar (banco, CTA, saldo final, barra progreso, estado badge), colapsa a compact bar tras seleccionar con botón "Cambiar"
- `MovementReconcileRow`: eliminada expansión inline de sugerencias; nueva columna ESTADO con badge dot (Conciliado / Pendiente / Sin Match); unlink y PDF en acciones de fila
- Nuevo `ReconciliationSidebar`: panel lateral 384px que calca el diseño de referencia — info box azul con movimiento seleccionado, buscador, chips de filtro (Mismo monto activo, Fecha próxima, RFC frecuente), cards de sugerencias con "MEJOR COINCIDENCIA" badge + botón sólido/outline, footer "Subir XML manualmente"
- Columnas tabla: FECHA · DESCRIPCIÓN · REFERENCIA · CARGO(-) · ABONO(+) · ESTADO · acciones (CARGO y ABONO se mantienen separadas — sistema contable)

---

## 2026-03-06 — Bot WhatsApp Business para solicitar CSF/Opinión 32-D

**Commits estables:** `bd4223d` (integración inicial), `43baa29` (fix número mexicano)

- Webhook META configurado en `GET/POST /api/whatsapp/webhook`
- Bot detecta RFC en mensaje y responde con PDF inmediato o encola scraper
- `normalizePhone`: corrige formato mexicano `521XXXXXXXXXX` → `52XXXXXXXXXX`
- `whatsapp_pending_requests`: tabla para entregas asíncronas (scraper → WhatsApp)
- `SatDocumentController::uploadFromAgent` despacha PDF a pendientes tras recibirlo del agente
- Token permanente de sistema Meta configurado en `.env` del servidor
- Limitación: app Meta sin publicar → agregar destinatarios manualmente en sandbox

---

## 2026-03-05 — CFDIs tipo E (Notas de crédito) en Control Provisional

**Commit estable:** `d2e8853`

- Nueva closure `getCreditNotesSum`: suma CFDIs `tipo = 'E'` no cancelados por período
- `total_efectivo` de ingresos y egresos ahora es neto (descuenta notas de crédito)
- JSON de respuesta incluye `notas_credito: {subtotal, iva, total}` en ingresos, egresos y no_deducibles
- `performAudit`: extiende reglas a tipo E (efectivo > $2,000, combustible, uso_cfdi D%)
- `getBucketDetails`: nuevos buckets `egresos_notascredito` / `ingresos_notascredito` para drill-down
- Frontend: fila "Notas de Crédito / Devoluciones" en rojo en tablas de gastos e ingresos (solo visible si hay notas en el período)
- Cubre anticipos (rel. 07), devoluciones, descuentos y cualquier CFDI tipo E recibido/emitido

---

## Optimización rendimiento Ronda 2 — Control Provisional (Mar 2026)

**Commit estable:** `1584d4e`

- Cache throttle en `performAudit`: solo corre 1 vez por RFC+período cada 30 min (antes tardaba 18s en cada GET)
- Reemplaza `COALESCE(fecha_fiscal, fecha)` por `whereBetween` index-friendly en performAudit para usar índice existente
- Migración: índice `(rfc_receptor, deduction_type, fecha_fiscal)` para acelerar lookup de CFDIs sin etiquetar
- Root cause: 116K CFDIs con `deduction_type IS NULL`, audit corría full scan en cada request

---

## Optimización rendimiento — Control Provisional (Mar 2026)

**Commit estable:** `b05478f`

- `performAudit`: cambia condición a `whereNull('deduction_type')` — ya no re-procesa CFDIs auditados en cada GET, solo nuevos sin etiqueta
- `getPendSum`: batch query a `cfdi_payments` con `whereIn+groupBy` en lugar de N+1 (una query por CFDI PPD)
- `getBucketDetails` bucket PENDIENTE: mismo fix batch
- `getPpdExplorer` y `getRepExplorer`: batch queries para pagos relacionados

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
