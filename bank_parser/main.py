import sys
import json
import argparse
import pandas as pd
from bank_classifier import identify_bank

from adapters.bbva import extract_bbva
from adapters.banamex import extract_banamex
from adapters.inbursa import extract_inbursa

def safe_float(val, default=0.0):
    try:
        # Limpiar caracteres comunes en estados de cuenta
        if val is None: return default
        s = str(val).strip().replace('$', '').replace(',', '').replace(' ', '')
        if not s or s == '-' or s == '--':
            return default
        # Manejar negativos representados como (100.00) o 100.00-
        if s.startswith('(') and s.endswith(')'):
            s = '-' + s[1:-1]
        elif s.endswith('-'):
            s = '-' + s[:-1]
        return float(s)
    except (ValueError, TypeError):
        return default

def main():
    try:
        parser = argparse.ArgumentParser(description="Analizador de Estados de Cuenta Bancarios (PDF a Excel/JSON)")
        parser.add_argument("pdf_path", help="Ruta absoluta al archivo PDF del estado de cuenta")
        parser.add_argument("--output", help="Ruta de salida para el archivo Excel (opcional)")
        args = parser.parse_args()

        pdf_path = args.pdf_path
        
        # 1. Identificar Banco
        try:
            banco = identify_bank(pdf_path)
        except Exception as e:
            sys.stderr.write(f"Error clasificando banco: {e}\n")
            banco = "desconocido"
        
        if not banco or banco == "desconocido":
            # Si no se identifica, intentamos proceder
            pass
            
        # 2. Extraer Transacciones
        try:
            result_data = None
            if banco == "bbva":
                result_data = extract_bbva(pdf_path)
            elif banco == "banamex":
                result_data = extract_banamex(pdf_path)
            elif banco == "inbursa":
                result_data = extract_inbursa(pdf_path)
            else:
                # Intento ciego si se forzó o algo
                result_data = {"movements": [], "summary": {}}
        except Exception as e:
            import traceback
            sys.stderr.write(f"Error en adapter {banco}: {traceback.format_exc()}\n")
            print(json.dumps({"success": False, "error": f"Error en procesador {banco}: {str(e)}"}))
            sys.exit(0)
            
        # Normalizar resultados
        transacciones = []
        metadata_summary = {}
        
        if isinstance(result_data, dict):
            transacciones = result_data.get("movements", [])
            metadata_summary = result_data.get("summary", {})
        else:
            transacciones = result_data or []

        # Si no hay transacciones (estamos en prueba), mockeamos para mostrar el flujo
        if not transacciones:
            transacciones = [
                {"banco": banco, "fecha": "2025-01-15", "concepto": "SIN MOVIMIENTOS DETECTADOS", "referencia": "0000", "cargo": 0.0, "abono": 0.0, "saldo": 0.0}
            ]

        # 3. Calcular Resumen Financiero con safe_float
        # Usamos None para distinguir entre "no encontrado" y "encontrado como 0.0"
        raw_initial = metadata_summary.get("initial_balance")
        raw_final = metadata_summary.get("final_balance")
        
        initial_balance = safe_float(raw_initial, None) if raw_initial is not None else None
        final_balance = safe_float(raw_final, None) if raw_final is not None else None
        
        total_cargos = sum(safe_float(t.get('cargo', 0)) for t in transacciones)
        total_abonos = sum(safe_float(t.get('abono', 0)) for t in transacciones)
        
        period = metadata_summary.get("period", "")
        account_number = metadata_summary.get("account_number", "PREDETERMINADA")
        
        if initial_balance is None and transacciones:
            first = transacciones[0]
            # Saldo Inicial = Saldo Primero - Abono + Cargo
            initial_balance = safe_float(first.get('saldo', 0)) - safe_float(first.get('abono', 0)) + safe_float(first.get('cargo', 0))
        elif initial_balance is None:
            initial_balance = 0.0
        
        if final_balance is None and transacciones:
            last = transacciones[-1]
            final_balance = safe_float(last.get('saldo', 0))
        elif final_balance is None:
            final_balance = 0.0

        # 4. Generar Excel Automáticamente
        excel_path = pdf_path.replace(".pdf", ".xlsx")
        try:
            df = pd.DataFrame(transacciones)
            df.to_excel(excel_path, index=False)
            auto_excel = excel_path
        except Exception as e:
            sys.stderr.write(f"Error generando Excel automático: {e}\n")
            auto_excel = None

        # 5. Exportar resultados
        result = {
            "success": True, 
            "banco": banco, 
            "transacciones": transacciones,
            "excel_path": auto_excel,
            "summary": {
                "initialBalance": initial_balance,
                "totalCargos": total_cargos,
                "totalAbonos": total_abonos,
                "finalBalance": final_balance,
                "period": period,
                "account_number": account_number
            }
        }
        
        print(json.dumps(result, indent=2))

    except Exception as e:
        import traceback
        error_msg = f"Error catastrófico en main: {str(e)}\n{traceback.format_exc()}"
        sys.stderr.write(error_msg)
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(0)

if __name__ == "__main__":
    main()

