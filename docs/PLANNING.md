# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Tarea: Backfill cfdi_payments para REPs existentes

**Archivos modificados:**
- `sat-api/app/Console/Commands/BackfillCfdiPaymentsCommand.php` ← nuevo

### Pasos
- [x] Analizar causa raíz: REPs importadas antes de que existiera `cfdi_payments`, por eso `pagosPropios` siempre vacío
- [x] El XML processor SÍ extrae pagos, pero `indexCfdi()` hace early-return si UUID ya existe
- [x] Crear comando `cfdi:backfill-payments` que:
  - Busca REPs tipo=P sin `cfdi_payments`
  - Lee el XML desde `path_xml` (o fallback a `xml_data` JSON)
  - Inserta registros en `cfdi_payments` con `firstOrCreate`
  - Soporta `--rfc=` para probar con César García primero
  - Soporta `--dry-run` para inspección previa
- [ ] Deploy a main y ejecutar en servidor

### Notas técnicas
- REP (tipo=P) en CFDI 4.0: `total=0` es correcto — el monto está en `pago20:Pago/DoctoRelacionado/@ImpPagado`
- `pagosPropios()` usa `uuid_pago = cfdi.uuid` — correcto
- Fallback a `xml_data` parsea la estructura `cfdi:Comprobante > cfdi:Complemento > pago20:Pagos > pago20:Pago`
