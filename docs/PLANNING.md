# Planeación de Tareas

## Tarea: Fix parser Inbursa — coordenadas dinámicas de columnas

**Objetivo:** Corregir el parser de estados de cuenta Inbursa que no capturaba bien cargo/abono/saldo por usar coordenadas hardcodeadas incompatibles con el PDF real.

### Pasos:
- [x] Identificar bug: `x1 >= 720` nunca aplica en PDF A4 (~595pt) → saldo siempre 0
- [x] Reescribir `extract_inbursa` con detección dinámica de columnas desde la fila cabecera (CARGOS/ABONOS/SALDO)
- [x] Asignar cada importe a la columna más cercana por distancia x-centro
- [x] Filtrar líneas de detalle SPEI (cuentas bancarias largas, folios SAT, RFC)
- [x] Confirmar que el corte "SI DESEA RECIBIR PAGOS" para la 2ª cuenta (inversiones) funciona

### Archivos modificados:
- `bank_parser/adapters/inbursa.py`

### Notas:
- El PDF de Inbursa tiene 2 cuentas: cuenta normal + cuenta inversiones en el mismo PDF. Solo se importa la primera (corte en "SI DESEA RECIBIR PAGOS").
- Las coordenadas de columnas se detectan buscando la fila que contiene CARGOS + ABONOS + SALDO.
- Fallback: proporciones típicas de página Inbursa (~595pt) si la detección falla.
