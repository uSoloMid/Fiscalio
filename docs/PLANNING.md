# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Tarea: Optimización rendimiento Ronda 2 — Control Provisional

**Archivos modificados:**
- `sat-api/app/Http/Controllers/ProvisionalControlController.php`
- `sat-api/database/migrations/2026_03_05_000004_add_deduction_type_index_to_cfdis.php`

**Pasos:**
- [x] Cache throttle en `performAudit`: solo corre 1 vez por RFC+período cada 30 min
- [x] Reemplazar `COALESCE(fecha_fiscal, fecha)` por condición `whereBetween` index-friendly en `performAudit`
- [x] Migración: índice compuesto `(rfc_receptor, deduction_type, fecha_fiscal)` para acelerar lookup de NULL audit
- [ ] Deploy + `migrate --force`
