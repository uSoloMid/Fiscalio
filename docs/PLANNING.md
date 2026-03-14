# Planeación de Tareas

## Tarea activa: Reporte de Pendientes de Conciliación

### Objetivo
Generar un reporte que consolide todo lo que falta por conciliar:
movimientos bancarios sin CFDI, facturas PUE sin pago en banco, PPD sin REP emitido,
PPD parcialmente pagados, REPs sin movimiento bancario, y nóminas sin pago en banco.

### Pasos
- [x] Actualizar PLANNING.md (este archivo)
- [x] Backend: método `pendingReport` en ReconciliationController
- [x] Backend: ruta `GET /api/reconciliation/pending-report` en api.php
- [x] Frontend: crear `ReconciliationReportPage.tsx`
- [x] Frontend: agregar llamada en `services.ts`
- [x] Frontend: anclar vista en InvoicesPage (`currentView = 'reconciliation-report'`)

### Archivos a modificar
- `sat-api/app/Http/Controllers/ReconciliationController.php`
- `sat-api/routes/api.php`
- `ui/src/pages/ReconciliationReportPage.tsx` (nuevo)
- `ui/src/services.ts`
- `ui/src/pages/InvoicesPage.tsx`

### Secciones del reporte
1. **Movimientos sin conciliar** — bank_movements con `cfdi_id IS NULL`
2. **PUE sin banco** — CFDIs `metodo_pago=PUE` no vinculados a ningún movimiento
   - Por cobrar (emitidas), Por pagar (recibidas), Nóminas (tipo N)
3. **PPD sin REP** — CFDIs `metodo_pago=PPD` sin ningún cfdi_payment relacionado
4. **PPD parcialmente pagados** — PPD con pagos pero `saldo_insoluto > 0`
5. **REP sin banco** — tipo P no vinculados a ningún movimiento bancario

### Decisiones técnicas
- El reporte filtra por RFC (business) y opcionalmente por rango de fechas
- Los ítems sin banco se muestran aunque no haya estados de cuenta cargados
  (el resumen indica si hay estados de cuenta disponibles)
- Nóminas se incluyen en "PUE sin banco" → sección propia dentro de egresos
