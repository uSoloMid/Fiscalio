# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Mejoras UX módulo de conciliación

**Objetivo:** Hacer la interfaz legible y funcional — descripción truncada, filas con identidad visual por estado, barra de progreso real.

### Archivos a modificar
- `sat-api/app/Http/Controllers/BankStatementController.php` — agregar `reconciled_count`
- `ui/src/components/MovementReconcileRow.tsx` — truncar descripción + highlight por estado
- `ui/src/pages/ReconciliationPage.tsx` — usar `reconciled_count` real

### Pasos
- [ ] Backend: `withCount` de movimientos con `cfdi_id IS NOT NULL` → campo `reconciled_count`
- [ ] Frontend: truncar descripción a ~60 chars con tooltip completo + borde izquierdo de color por estado
- [ ] Frontend: barra de progreso usa `reconciled_count / movements_count` real
