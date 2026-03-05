# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Tarea: Optimización módulo de facturas (velocidad y filtros)

**Archivos a modificar:**
- `sat-api/database/migrations/` — nueva migración con índices faltantes
- `sat-api/app/Http/Controllers/InvoiceController.php` — extraer query builder, usar rangos de fecha
- `ui/src/pages/InvoicesPage.tsx` — debounce en búsqueda, fix state de filtros

**Pasos:**
- [ ] Migración: agregar índices en `tipo`, `es_cancelado`, compuestos (rfc+fecha_fiscal)
- [ ] Controller: extraer `buildCfdiQuery()`, reemplazar `whereYear`/`whereMonth` con `BETWEEN`
- [ ] Frontend: debounce 400ms en campo de búsqueda
- [ ] Frontend: reset `cfdiTipo` al cambiar a "canceladas"
- [ ] Deploy
