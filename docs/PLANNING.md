# Planeación de Tareas

## Tarea activa: Módulo Facturas — Soporte Nómina (Paso 1: Tabla)

### Pasos
- [x] Revisar estructura actual (InvoicesPage, Cfdi model, XmlProcessorService)
- [ ] Agregar accessors al modelo Cfdi para campos de nómina (fecha_final_pago, total_percepciones, total_deducciones)
- [ ] Actualizar interfaz TypeScript `Cfdi` en models.ts
- [ ] Actualizar tabla en InvoicesPage: headers y celdas específicas para tipo=N
  - Headers: RFC/Nombre → "Empleado", Concepto → "F. Final Pago", IVA → "Percepciones", Ret → "Deducciones"
  - Celdas: mostrar nomina_fecha_final_pago, nomina_total_percepciones, nomina_total_deducciones

### Archivos a modificar
- `sat-api/app/Models/Cfdi.php`
- `ui/src/models.ts`
- `ui/src/pages/InvoicesPage.tsx`

### Decisiones técnicas
- No se almacenan columnas nuevas en BD; se extraen de xml_data mediante accessors (ya está guardado, sin tocar XmlProcessorService)
- Para el nombre del trabajador: usar name_receptor que ya existe (receptor = empleado en nóminas emitidas)
- Los accessors retornan null para CFDIs que no son tipo N (short-circuit rápido)
