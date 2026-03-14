# Planeación de Tareas

## Tarea activa: Multi-CFDI en Conciliaciones (1 depósito → N facturas)

### Objetivo
Permitir vincular múltiples facturas a un solo movimiento bancario manualmente.

### Pasos
- [ ] Migración: crear tabla `bank_movement_cfdis` + migrar datos existentes de `cfdi_id`
- [ ] Modelo `BankMovementCfdi` + actualizar `BankMovement` (relación `cfdis()`)
- [ ] `ReconciliationController`: reconcile añade (no reemplaza), unreconcile elimina CFDI específico, suggest usa junction table, pendingReport usa junction table
- [ ] Rutas: unreconcile acepta query param `cfdi_id`
- [ ] Frontend `models.ts`: `cfdis?: Cfdi[]` en `BankMovement`
- [ ] Frontend `services.ts`: `unreconcileMovement(id, cfdiId?)`
- [ ] Frontend `ReconciliationSidebar.tsx`: UX multi-CFDI (lista de vinculados + agregar más)
- [ ] Frontend `MovementReconcileRow.tsx`: mostrar múltiples CFDIs

### Archivos modificados
- `sat-api/database/migrations/2026_03_14_000001_create_bank_movement_cfdis_table.php` (nuevo)
- `sat-api/app/Models/BankMovementCfdi.php` (nuevo)
- `sat-api/app/Models/BankMovement.php`
- `sat-api/app/Http/Controllers/ReconciliationController.php`
- `sat-api/routes/api.php`
- `ui/src/models.ts`
- `ui/src/services.ts`
- `ui/src/components/ReconciliationSidebar.tsx`
- `ui/src/components/MovementReconcileRow.tsx`
