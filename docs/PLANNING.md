# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Tarea: Optimización de rendimiento — Módulo Control Provisional

**Archivos modificados:**
- `sat-api/app/Http/Controllers/ProvisionalControlController.php`

**Pasos:**
- [x] Fix `performAudit`: cambiar condición a `whereNull('deduction_type')` para no re-auditar CFDIs ya procesados en cada carga
- [x] Fix N+1 en `getPendSum`: batch query a `cfdi_payments` con `whereIn` + `groupBy`
- [x] Fix N+1 en `getBucketDetails` bucket PENDIENTE: mismo patrón batch
- [x] Fix N+1 en `getPpdExplorer`: batch query con `groupBy`
- [x] Fix N+1 en `getRepExplorer`: batch query con `groupBy`
- [ ] Deploy a producción
