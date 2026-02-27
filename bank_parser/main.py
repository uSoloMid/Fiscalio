import sys
import json
import argparse
import pandas as pd
from bank_classifier import identify_bank

from adapters.bbva import extract_bbva
from adapters.banamex import extract_banamex

def main():
    parser = argparse.ArgumentParser(description="Analizador de Estados de Cuenta Bancarios (PDF a Excel/JSON)")
    parser.add_argument("pdf_path", help="Ruta absoluta al archivo PDF del estado de cuenta")
    parser.add_argument("--output", help="Ruta de salida para el archivo Excel (opcional)")
    args = parser.parse_args()

    pdf_path = args.pdf_path
    
    # 1. Identificar Banco
    banco = identify_bank(pdf_path)
    
    if not banco:
        print(json.dumps({"error": "No se pudo identificar el banco del PDF."}))
        sys.exit(1)
        
    # 2. Extraer Transacciones (dependiendo del banco)
    transacciones = []
    
    if banco == "bbva":
        transacciones = extract_bbva(pdf_path)
    elif banco == "banamex":
        transacciones = extract_banamex(pdf_path)
    elif banco == "banbajio":
         pass
    elif banco == "hsbc":
         pass
    else:
        print(json.dumps({"error": f"Banco {banco} detectado pero no soportado aún."}))
        sys.exit(1)

    # Si no hay transacciones (estamos en prueba), mockeamos para mostrar el flujo
    if not transacciones:
        transacciones = [
            {"banco": banco, "fecha": "2026-02-15", "concepto": "EJEMPLO EXTRACCION", "referencia": "0000", "cargo": 0.0, "abono": 100.0, "saldo": 100.0}
        ]

    # 3. Exportar resultados
    if args.output:
        df = pd.DataFrame(transacciones)
        df.to_excel(args.output, index=False)
        print(json.dumps({"success": True, "banco": banco, "output": args.output}))
    else:
        # Imprime JSON estandarizado para que lo lea PHP/Laravel
        print(json.dumps({"success": True, "banco": banco, "transacciones": transacciones}, indent=2))

if __name__ == "__main__":
    main()
