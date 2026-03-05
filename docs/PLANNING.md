# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Fix Banamex parser: duplicación cargo/abono

**Problema:** Amounts en DEPOSITOS también se asignan a RETIROS (cargo).
**Causa raíz:** Enfoque center±MARGIN crea zonas de overlap entre columnas adyacentes.
**Solución:** Usar midpoints entre columnas como fronteras duras (cada px pertenece a exactamente una columna).

### Pasos
- [ ] Cambiar lógica de asignación en `bank_parser/adapters/banamex.py`
- [ ] Commit en dev
- [ ] Merge a main cuando funcione
