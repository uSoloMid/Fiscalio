# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

## 2026-03-08 — Rediseño UX módulo Conciliación Bancaria

### Objetivo
Limpiar y modernizar la interfaz de conciliación: selector de bancos colapsable,
tabla de movimientos más limpia, y panel lateral para sugerencias de vinculación.

### Pasos
- [ ] Crear `ReconciliationSidebar.tsx` — panel lateral con sugerencias (calca el diseño de referencia)
- [ ] Refactorizar `MovementReconcileRow.tsx` — quitar expansión inline, nueva columna ESTADO badge
- [ ] Refactorizar `ReconciliationPage.tsx` — selector de bancos colapsable (cards → compact bar), layout con sidebar

### Archivos a modificar
- `ui/src/components/ReconciliationSidebar.tsx` (nuevo)
- `ui/src/components/MovementReconcileRow.tsx`
- `ui/src/pages/ReconciliationPage.tsx`

### Decisiones técnicas
- Columnas tabla: FECHA · DESCRIPCIÓN · REFERENCIA · CARGO(-) · ABONO(+) · ESTADO · acciones (se mantienen CARGO y ABONO separadas — sistema contable)
- Selector colapsable: expandido al entrar, se contrae al seleccionar banco → compact bar con botón "Cambiar"
- Sidebar: ancho fijo 384px, aparece al hacer clic en movimiento pendiente, se cierra al vincular
