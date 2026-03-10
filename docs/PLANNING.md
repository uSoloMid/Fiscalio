# Planeación de Tareas

## Mitigación de "Error no controlado" (SAT Code 5005) en solicitudes
- [ ] Investigar patrones de error 5005 en base de datos.
- [ ] Modificar `SatRunnerCommand.php` para manejar reintentos con ID fresco cuando el SAT devuelve 5005 persistentemente.
- [ ] Mejorar el etiquetado del error en `RequestDetailsModal.tsx` para mayor claridad del usuario.
- [ ] Verificar funcionamiento con logs simulados o reales.
- [ ] Committear a `dev` y mover a `HISTORY.md`.

_No hay otras tareas activas actualmente._
