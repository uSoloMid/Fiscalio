# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

# Planning — Tarea en curso

### Implementación del Parser de Estados de Cuenta Inbursa
- [x] Analizar estructura de la carátula Inbursa (Saldo anterior, actual, CLABE, periodo)
- [x] Actualizar `bank_classifier.py` para detectar PDFs de Inbursa
- [x] Crear `bank_parser/adapters/inbursa.py` con lógica de extracción de carátula
- [x] Integrar nuevo adapter en `bank_parser/main.py`
- [x] Validar extracción de carátula con la imagen proporcionada
- [x] Implementar extracción de movimientos (basado en imágenes proporcionadas)

**Archivos a modificar:**
- `docs/PLANNING.md`
- `bank_parser/bank_classifier.py`
- `bank_parser/adapters/inbursa.py` (nuevo)
- `bank_parser/main.py`

