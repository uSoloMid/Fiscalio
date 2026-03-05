# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## CFDIs tipo E en Control Provisional (Notas de crédito, devoluciones, anticipos)

**Problema:** El controller filtra `tipo = 'I'` en todas las queries. CFDIs tipo E (notas de crédito, devoluciones, aplicaciones de anticipo) nunca entran en ningún cálculo. Resultado: gastos inflados, ingresos inflados.

**Archivos a modificar:**
- `sat-api/app/Http/Controllers/ProvisionalControlController.php`
- `ui/src/pages/ProvisionalControlPage.tsx`

### Pasos

- [x] Escribir PLANNING.md
- [x] Backend: nueva closure `$getCreditNotesSum($direction, $onlyDeductible)` — suma CFDI tipo E por período
- [x] Backend: calcular `$ingCreditNotes`, `$egrCreditNotes`, `$ndCreditNotes`
- [x] Backend: ajustar `total_efectivo` (neto de notas de crédito) en response JSON
- [x] Backend: añadir `notas_credito` al JSON de ingresos y egresos
- [x] Backend: `performAudit` — añadir reglas para tipo E (efectivo >2000, combustible, uso_cfdi D)
- [x] Backend: `getBucketDetails` — buckets `egresos_notascredito` e `ingresos_notascredito`
- [x] Frontend: actualizar interfaz TypeScript (`notas_credito` en SummaryData)
- [x] Frontend: nueva fila "Notas de Crédito / Devoluciones" visible en tablas de egresos e ingresos (rojo, con drill-down)
