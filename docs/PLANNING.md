# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Conciliación inteligente: algoritmo mejorado + aprendizaje

**Objetivo:** Motor de matching más inteligente basado en REPs (suma total, facturas relacionadas), extracción de nombre/RFC de descripción bancaria, y aprendizaje de patrones manuales.

### Archivos a modificar/crear
- `sat-api/database/migrations/*_create_reconciliation_patterns.php` — nueva tabla
- `sat-api/app/Models/ReconciliationPattern.php` — nuevo modelo
- `sat-api/app/Models/Cfdi.php` — agregar `pagosPropios()` (relación correcta para REPs)
- `sat-api/app/Http/Controllers/ReconciliationController.php` — reescritura del algoritmo
- `ui/src/components/MovementReconcileRow.tsx` — mostrar facturas relacionadas en REPs

### Pasos
- [ ] PLANNING.md actualizado
- [ ] Migration: `reconciliation_patterns` (business_id, description_keyword, counterpart_rfc, confirmed_count)
- [ ] Model + Cfdi::pagosPropios()
- [ ] Backend: REP matching por suma total (no por pago individual)
- [ ] Backend: Extracción de nombre/RFC de descripción (patrones SPEI mexicanos)
- [ ] Backend: Confidence score con nombre/RFC match
- [ ] Backend: Aprendizaje — guardar patrón al confirmar manualmente
- [ ] Backend: Boost de confidence si descripción coincide con patrón aprendido
- [ ] Frontend: Mostrar facturas relacionadas en sugerencia de REP
- [ ] Deploy
