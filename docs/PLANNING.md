# Planeación de Tareas

## Módulo de Pólizas Contables (ContPAQi)

### Descripción
Generar pólizas contables desde movimientos bancarios conciliados y CFDIs,
exportarlas en formato TXT para importar en CONTPAQi Contabilidad v18.

### Plantillas iniciales
1. **Provisión de Venta** (Diario) — nace del CFDI emitido
2. **Cobro** (Ingreso) — nace del movimiento bancario

### Archivos a crear / modificar

**Backend (sat-api/):**
- `database/migrations/*_create_poliza_tables.php` (6 tablas)
- `app/Models/PolizaTemplate.php`
- `app/Models/PolizaTemplateLine.php`
- `app/Models/RfcAccountMap.php`
- `app/Models/BankAccountMap.php`
- `app/Models/Poliza.php`
- `app/Models/PolizaLine.php`
- `app/Services/PolizaGeneratorService.php`
- `app/Services/PolizaExportService.php`
- `app/Http/Controllers/PolizaController.php`
- `app/Http/Controllers/PolizaTemplateController.php`
- `routes/api.php` (nuevas rutas)

**Frontend (ui/src/):**
- `pages/PolizasPage.tsx` — página principal
- `components/RfcAccountMapDialog.tsx` — asignar cuenta a RFC cuando falta
- `models.ts` — nuevas interfaces
- `services.ts` — nuevas llamadas API

### Pasos
- [x] Plan definido
- [x] Migraciones DB (6 tablas)
- [x] Modelos Laravel
- [x] PolizaGeneratorService
- [x] PolizaExportService (TXT ancho fijo)
- [x] Controllers + rutas (PolizaController + PolizaTemplateController)
- [x] Frontend página Pólizas (PolizasPage, AccountPicker, MissingAccountsDialog, GeneratePanel)

### Notas técnicas
- Formato TXT: filas P (header), M (movimiento), AD (UUID) — ancho fijo, Windows-1252
- Tipo póliza: 1=Ingreso, 2=Egreso, 3=Diario
- tipo_movto: 0=Cargo (Debe), 1=Abono (Haber)
- account_source: fixed | rfc_cliente | rfc_proveedor | banco
- importe_source: cfdi_total | cfdi_subtotal | cfdi_iva | cfdi_retencion_isr | cfdi_retencion_iva | movement_amount
- Provisión Venta: trigger_type='cfdi', cfdi_tipo='I', we are emisor
- Cobro: trigger_type='movement', movement_direction='abono'
