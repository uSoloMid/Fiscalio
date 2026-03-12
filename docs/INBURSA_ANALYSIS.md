# Análisis y Corrección del Parser de Inbursa (Diciembre / Caso EdoCuenta 18)

## 1. El Problema Encontrado

Al analizar el archivo `EdoCuenta_Inbursa (18).pdf`, se observó una gran discrepancia entre los totales calculados y los esperados por el usuario:
- **Esperado:** Saldo Final de **$92,392.57**.
- **Resultado del Parser Anterior:** Saldo final terminaba cerca de **$120,800.66** e incluía movimientos que no debían procesarse.

Al profundizar en el contenido del PDF, se identificaron **múltiples secciones** de cuenta dentro del mismo documento:

1. **Sección Principal (Cuenta Corriente / Terminales):** 
   - Coincide con las cifras indicadas en la carátula de la primera página:
     - Saldo Anterior: $91,644.33
     - Abonos: $770.00
     - Cargos: $21.76
     - Saldo Actual: $92,392.57
2. **Secciones Adicionales (Resumen Principal Extendido / Inversión):** 
   - Más adelante en el PDF (hasta la página 11-12) existe un desglose mayor donde los cargos y abonos superan los $290,000 y el saldo final termina en $120,800.66.
   - En la página 13 aparece un "Resumen Gráfico de Saldos y Movimientos" para una cuenta/tarjeta que muestra un Saldo Anterior de $1,250,437.80.

**Causa del Bug:** El código anterior (parser general) no tenía una condición estricta de "fin de sección de cuenta corriente", por lo que seguía extrayendo transacciones y sobreescribiendo el saldo hasta recorrer todas las páginas.

## 2. La Solución Aplicada

Se implementaron las siguientes correcciones en `c:\Fiscalio\bank_parser\adapters\inbursa.py`:

1. **Extracción Estricta del Resumen:** Se ajustaron los patrones de búsqueda para forzar que los campos de `initial_balance`, `final_balance`, `total_abonos` y `total_cargos` se alimenten directamente de la **primera tabla de resumen** de la Página 1, coincidiendo con la cuenta principal objetivo.

2. **Parada Temprana (`stop_found`):** Se modificó la heurística de detención de extracción al encontrar los fin de bloque de las tablas de movimientos (`"RESUMEN DEL CFDI"`, `"RESUMEN GRAFICO"` o `"SI DESEA RECIBIR PAGOS"`). Así, ignoramos cualquier sección posterior que corresponda a métricas informativas distintas o a la posible cuenta de inversión que generaba movimientos extra.

3. **Estandarización de Patrones:** Se eliminó el uso de regex estrictas con fin de línea (`$`) en la captura de abonos/cargos porque los cuadros de la primera página a veces traen espacios invisibles. Ahora detectan con `r'ABONOS'` y `r'CARGOS'` de manera más tolerante.

Con esto, el analizador extrae **exclusivamente** la cuenta requerida en Inbursa, ignorando los registros de las subcuentas o cortes adicionales y haciendo match exacto.
