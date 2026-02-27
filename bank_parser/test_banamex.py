import fitz
import re

def extract_banamex(pdf_path):
    transacciones = []
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text() + "\n---PAGE---\n"
            
        # Limpieza básica
        lines = text.split("\n")
        
        in_details = False
        current_tx = None
        
        date_pattern = re.compile(r"^(\d{2}) ([A-Z]{3})$")
        mount_pattern = re.compile(r"^\d{1,3}(,\d{3})*(\.\d{2})?$")
        
        # Iteration
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            if "DETALLE DE OPERACIONES" in line:
                in_details = True
                i += 1
                continue
                
            if in_details and "SALDO ANTERIOR" in line:
                i += 1
                continue
                
            if in_details and i + 1 < len(lines):
                # Intentamos detectar si la línea actual es una fecha de movimiento (ej: "06 ENE")
                date_match = date_pattern.match(line)
                if date_match and ("---PAGE---" not in line) and len(line) == 6:
                    fecha_str = f"2026-{date_match.group(2)}-{date_match.group(1)}" # Hardcoded year for testing
                    current_tx = {
                        "banco": "Banamex",
                        "fecha": fecha_str,
                        "concepto": "",
                        "referencia": "",
                        "cargo": 0.0,
                        "abono": 0.0,
                        "saldo": 0.0
                    }
                    
                    # El concepto suele seguir en las siguientes líneas hasta que encontremos un monto.
                    i += 1
                    concepto_lines = []
                    while i < len(lines):
                        next_line = lines[i].strip()
                        if mount_pattern.match(next_line):
                            # Encontramos un monto. Puede ser cargo, abono o saldo. 
                            # En banamex se complica porque no están alineados fácilmente en texto, pero usualmente 
                            # están al final de la descripción.
                            # Para prueba simple, asignamos a Abono.
                            val = float(next_line.replace(",", ""))
                            current_tx["abono"] = val
                            break
                        elif next_line == "---PAGE---" or "DETALLE DE" in next_line or date_pattern.match(next_line):
                            break
                        else:
                            concepto_lines.append(next_line)
                        i += 1
                    
                    current_tx["concepto"] = " ".join(concepto_lines)
                    transacciones.append(current_tx)
            i += 1
            
        return transacciones
    except Exception as e:
        print("Error", e)
        return []

if __name__ == "__main__":
    txs = extract_banamex("BANAMEX.pdf")
    for tx in txs[:5]:
        print(tx)
