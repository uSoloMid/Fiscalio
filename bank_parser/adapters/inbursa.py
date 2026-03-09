import pdfplumber
import re
import sys

def extract_inbursa(pdf_path):
    transacciones = []
    summary = {
        "initial_balance": None,
        "final_balance": None,
        "total_cargos": 0.0,
        "total_abonos": 0.0,
        "account_number": "PREDETERMINADA",
        "period": ""
    }

    # Meses en español para Inbursa
    meses_str = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06", 
                 "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"}

    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2026" # Fallback
            
            # --- PARTE 1: ESCANEAR CARÁTULA (Página 1) ---
            first_page = pdf.pages[0]
            page_text = first_page.extract_text() or ""
            
            # 1. Detectar CLABE (como número de cuenta)
            clabe_match = re.search(r"CLABE\s+(\d+)", page_text)
            if clabe_match:
                summary["account_number"] = clabe_match.group(1)
            
            # 2. Detectar Periodo y Año
            period_match = re.search(r"PERIODO\s+Del\s+.*?\s+(\d{4})", page_text)
            if period_match:
                year_str = period_match.group(1)
            
            # Formatear periodo para el summary
            period_full = re.search(r"PERIODO\s+Del\s+(.*?)\s+al\s+(.*?)(?:\n|$)", page_text)
            if period_full:
                summary["period"] = f"{period_full.group(1)} - {period_full.group(2)}".replace("\r", "").strip()

            # 3. Búsqueda de Balances en el resumen (en carátula)
            words_first = first_page.extract_words()
            targets = [
                (r"SALDO\s+ANTERIOR", "initial_balance"),
                (r"SALDO\s+ACTUAL", "final_balance"),
                (r"ABONOS", "total_abonos"),
                (r"CARGOS", "total_cargos")
            ]

            lines_first = {}
            for w in words_first:
                y = round(w['top'])
                found_y = False
                for ky in lines_first.keys():
                    if abs(ky - y) < 4:
                        lines_first[ky].append(w)
                        found_y = True
                        break
                if not found_y: lines_first[y] = [w]

            for y_coord in sorted(lines_first.keys()):
                line_words = sorted(lines_first[y_coord], key=lambda x: x['x0'])
                line_txt = " ".join([lw['text'].upper() for lw in line_words])
                for pattern, key in targets:
                    if re.search(pattern, line_txt):
                        # Buscamos el valor numérico a la derecha de la etiqueta
                        for cand in reversed(line_words):
                            clean = cand['text'].replace("$", "").replace(",", "")
                            if re.match(r"^-?[\d,]+\.\d{2}$", clean) or clean in ["0", "0.00"]:
                                summary[key] = float(clean)
                                break

            # --- PARTE 2: EXTRAER MOVIMIENTOS ---
            in_details = False
            current_tx = None
            
            for page in pdf.pages:
                words = page.extract_words(x_tolerance=2, y_tolerance=3)
                if not words: continue

                # Agrupar en líneas visuales
                lines = []
                words.sort(key=lambda w: (w['top'], w['x0']))
                
                if not words: continue
                current_line = [words[0]]
                for w in words[1:]:
                    if abs(w['top'] - current_line[-1]['top']) < 3:
                        current_line.append(w)
                    else:
                        lines.append(current_line)
                        current_line = [w]
                if current_line: lines.append(current_line)

                # Detección de cabecera de tabla en cada página
                start_y = 0
                cutoff_y = page.height
                
                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words]).upper()
                    if "DETALLE DE MOVIMIENTOS" in text_line:
                        in_details = True
                    if "FECHA" in text_line and "CONCEPTO" in text_line and "SALDO" in text_line:
                        start_y = line_words[0]['bottom'] + 2
                    
                    if "TOTAL DE MOVIMIENTOS" in text_line or "SI DESEA RECIBIR PAGOS" in text_line:
                        cutoff_y = line_words[0]['top'] - 5
                        break

                if not in_details: continue

                for line_words in lines:
                    top = line_words[0]['top']
                    if top <= start_y or top >= cutoff_y: continue
                    
                    text_line = " ".join([w['text'] for w in line_words])
                    
                    # Nueva transacción: "FEB. 03"
                    date_match = re.search(r"^([A-Z]{3})\.?\s+(\d{2})", text_line.upper())
                    
                    if date_match:
                        if current_tx:
                            transacciones.append(current_tx)
                            
                        dia = date_match.group(2)
                        mes_abbr = date_match.group(1).replace(".", "")
                        mes = meses_str.get(mes_abbr, "01")
                        
                        current_tx = {
                            "banco": "INBURSA",
                            "fecha": f"{year_str}-{mes}-{dia}",
                            "concepto": "",
                            "referencia": "",
                            "cargo": 0.0,
                            "abono": 0.0,
                            "saldo": 0.0
                        }
                        
                        # Referencia (columna 2)
                        for w in line_words:
                            x0 = w['x0']
                            if 70 < x0 < 150:
                                if re.match(r"^\d+$", w['text']):
                                    current_tx["referencia"] = w['text']
                                    break
                    
                    if current_tx:
                        desc_parts = []
                        for w in line_words:
                            txt = w['text']
                            x1 = w['x1']
                            x0 = w['x0']
                            
                            if x1 < 150: continue 
                            
                            clean = txt.replace(",", "")
                            is_money = re.match(r"^-?[\d,]+\.\d{2}$", txt)
                            
                            if is_money:
                                val = float(clean)
                                # Coordenadas estimadas para columnas de montos
                                if 400 < x1 < 505: 
                                    current_tx["cargo"] = val
                                elif 505 <= x1 < 585: 
                                    current_tx["abono"] = val
                                elif x1 >= 585: 
                                    current_tx["saldo"] = val
                            else:
                                if 150 <= x0 < 420:
                                    if "BALANCE INICIAL" in txt.upper(): continue
                                    desc_parts.append(txt)
                        
                        inc_desc = " ".join(desc_parts).strip()
                        if inc_desc:
                            current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()

            if current_tx:
                transacciones.append(current_tx)

        # Post-procesamiento
        transacciones = [t for t in transacciones if t["concepto"] or t["cargo"] > 0 or t["abono"] > 0]

        return {
            "movements": transacciones,
            "summary": summary
        }
    except Exception as e:
        import traceback
        sys.stderr.write(f"Error procesando INBURSA: {e}\n{traceback.format_exc()}\n")
        return {"movements": [], "summary": summary}
