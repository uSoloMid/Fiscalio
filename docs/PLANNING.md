# Planeación de Tareas

## Fix conciliación: marcar completa + monto REP

### Archivos modificados
- `ui/src/pages/ReconciliationPage.tsx`
- `ui/src/components/ReconciliationSidebar.tsx`
- `sat-api/app/Http/Controllers/ReconciliationController.php`
- `sat-api/app/Http/Controllers/BankStatementController.php`

### Pasos
- [x] Fix filtro "pendiente": usar `cfdis.length > 0 || cfdi_id` en vez de solo `cfdi_id`
  - `computeStats`, `reconciledCount`, `filteredMovements`, `handleMovementReconciled`
- [x] Fix `reconciled_count` en BankStatementController: contar vía junction table `bank_movement_cfdis`
- [x] Backend: cargar `cfdis.pagosPropios` en `suggest()` y `reconcile()`
- [x] Sidebar: mostrar suma de `pagos_propios.monto_pagado` en lugar de `cfdi.total` para REPs

### Decisiones técnicas
- El backend usa junction table `bank_movement_cfdis` (no `cfdi_id` directo) → frontend debe usar `cfdis.length`
- REPs en SAT siempre tienen `total = 0`; el monto real está en `cfdi_payments.monto_pagado`
