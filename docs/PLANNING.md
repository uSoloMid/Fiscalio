# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

## 2026-03-08 — UX Conciliación: jerarquía visual, progreso y filtros

### Objetivo
Corregir problemas de legibilidad y señal visual en el módulo de conciliación:
jerarquía clara, montos prominentes, badges de estado grandes, barra de progreso y filtros.

### Pasos
- [ ] `MovementReconcileRow`: montos `text-lg font-black`, badges más grandes con icono, truncado ~40 chars, fondos por estado
- [ ] `ReconciliationPage`: barra de progreso visible, filtros Todas/Pendientes/Conciliadas

### Archivos a modificar
- `ui/src/components/MovementReconcileRow.tsx`
- `ui/src/pages/ReconciliationPage.tsx`
