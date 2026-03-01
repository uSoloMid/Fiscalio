import pdfplumber
import re
import sys

def extract_bbva(pdf_path):
    transacciones = []
    # Meses en español para BBVA
    meses_str = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06", 
                 "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"}
    
    summary = {
        "initial_balance": 0.0,
        "final_balance": 0.0,
        "total_cargos": 0.0,
        "total_abonos": 0.0,
        "account_number": "PREDETERMINADA",
        "period": ""
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2025"
            
            # --- PARTE 1: ESCANEAR RESUMEN (Primeras 4 páginas) ---
            found_summary = False
            for p_idx in range(min(4, len(pdf.pages))):
                if found_summary: break
                page = pdf.pages[p_idx]
                page_text = page.extract_text() or ""
                
                # 1. Detectar Periodo
                if not summary["period"]:
                    period_match = re.search(r"AL (\d{2})/(\d{2})/(\d{4})", page_text)
                    if period_match:
                        d, m, y = period_match.groups()
                        year_str = y
                        months_map = {"01":"ENE","02":"FEB","03":"MAR","04":"ABR","05":"MAY","06":"JUN","07":"JUL","08":"AGO","09":"SEP","10":"OCT","11":"NOV","12":"DIC"}
                        summary["period"] = f"{months_map.get(m, 'MES')}-{y}"

                # 2. Detectar Bloque de Resumen (Comportamiento es el ancla real)
                words = page.extract_words()
                anchor = None
                for w in words:
                    if "COMPORTAMIENTO" in w['text'].upper():
                        anchor = w
                        break
                
                if not anchor: # Fallback a Información Financiera si no está Comportamiento
                    for w in words:
                        if "INFORMACION FINANCIERA" in w['text'].upper():
                            anchor = w
                            break
                
                if anchor:
                    # Limitar búsqueda al lado derecho si es Comportamiento (x > 300 aprox)
                    # Si es Info Financiera, Comportamiento suele estar a la derecha
                    x_start = anchor['x0'] - 5 
                    if "INFORMACION" in anchor['text'].upper():
                        x_start = page.width / 2 # Forzar mitad derecha
                        
                    box_words = [nw for nw in words if nw['top'] > anchor['top'] and nw['top'] < anchor['top'] + 250 and nw['x0'] > x_start]
                    
                    # Agrupar por líneas (Y)
                    y_groups = {}
                    for bw in box_words:
                        line_y = round(bw['top'])
                        found_y = False
                        for ky in y_groups.keys():
                            if abs(ky - line_y) < 6:
                                y_groups[ky].append(bw)
                                found_y = True
                                break
                        if not found_y: y_groups[line_y] = [bw]
                    
                    for y_coord in sorted(y_groups.keys()):
                        line = y_groups[y_coord]
                        line.sort(key=lambda x: x['x0'])
                        line_txt = " ".join([lw['text'].upper() for lw in line])
                        
                        # El valor de dinero siempre está al final (derecha)
                        nums_in_line = []
                        for lw in reversed(line):
                            clean = lw['text'].replace("$","").replace(",","")
                            # Validar que parezca un monto (con .xx o .00)
                            if re.match(r"^-?[\d,]+\.\d{2}$", clean) or clean == "0.00" or clean == "0":
                                try:
                                    val = float(clean)
                                    nums_in_line.append(val)
                                except: pass
                        
                        if not nums_in_line: continue
                        
                        # Tomar el valor más a la derecha
                        target_val = nums_in_line[0]
                        
                        if "ANTERIOR" in line_txt:
                            summary["initial_balance"] = target_val
                            found_summary = True
                        elif "FINAL" in line_txt and "(+)" in line_txt:
                            summary["final_balance"] = target_val
                        elif "ABONOS" in line_txt:
                            summary["total_abonos"] = target_val
                        elif "CARGOS" in line_txt:
                            summary["total_cargos"] = target_val

            # --- PARTE 2: EXTRAER MOVIMIENTOS ---
            in_details = False
            current_tx = None
            stop_all = False
            
            for page in pdf.pages:
                if stop_all: break
                
                words = page.extract_words(x_tolerance=2, y_tolerance=3)
                if not words: continue
                
                # Agrupamos en líneas visuales
                lines = []
                words.sort(key=lambda w: (w['top'], w['x0']))
                
                current_line = [words[0]]
                for w in words[1:]:
                    if abs(w['top'] - current_line[-1]['top']) < 3:
                        current_line.append(w)
                    else:
                        lines.append(current_line)
                        current_line = [w]
                if current_line:
                    lines.append(current_line)

                # BARRERA GEOMÉTRICA (COORDENADA Y) - CORTE INFERIOR
                cutoff_y = page.height
                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    if "Total de Movimientos" in text_line:
                        cutoff_y = min(cutoff_y, line_words[0]['top'] - 5)
                        stop_all = True
                        break
                
                # BARRERA SUPERIOR (Donde empiezan los movimientos)
                start_y = 0
                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    if "Detalle de Movimientos Realizados" in text_line:
                        start_y = line_words[0]['bottom'] + 10
                        in_details = True
                        break
                
                # Filtramos líneas por el "Cuadro" de transacciones
                valid_lines = [lw for lw in lines if lw[0]['top'] > start_y and lw[0]['top'] < cutoff_y]

                for line_words in valid_lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    
                    if "FECHA" in text_line and "SALDO" in text_line:
                        continue
                    if "OPER LIQ" in text_line or "CARGOS ABONOS" in text_line:
                        continue
                    if "Estimado Cliente" in text_line or "La GAT Real" in text_line:
                        continue

                    first_word = line_words[0]['text']
                    date_match = re.match(r"^(\d{2})/([A-Z]{3})$", first_word)

                    if date_match:
                        if current_tx:
                            transacciones.append(current_tx)
                            
                        dia = date_match.group(1)
                        mes = meses_str.get(date_match.group(2), "01")
                        
                        current_tx = {
                            "banco": "BBVA",
                            "fecha": f"{year_str}-{mes}-{dia}",
                            "concepto": "",
                            "referencia": "",
                            "cargo": 0.0,
                            "abono": 0.0,
                            "saldo": 0.0
                        }
                    
                    if current_tx:
                        desc_parts = []
                        for i, w in enumerate(line_words):
                            tw = w['text']
                            x1 = w['x1']
                            
                            if re.match(r"^\d{2}/[A-Z]{3}$", tw) and i < 3:
                                continue
                            
                            if re.match(r"^-?\d{1,3}(,\d{3})*\.\d{2}$", tw):
                                val = float(tw.replace(",", ""))
                                if 330 < x1 <= 425:
                                    current_tx["cargo"] = val
                                elif 425 < x1 <= 485:
                                    current_tx["abono"] = val
                                elif x1 > 485:
                                    if current_tx["saldo"] == 0:
                                        current_tx["saldo"] = val
                            else:
                                desc_parts.append(tw)
                        
                        inc_desc = " ".join(desc_parts)
                        if inc_desc:
                            current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()
                        
                        if "Ref. " in current_tx["concepto"]:
                            parts = current_tx["concepto"].split("Ref. ")
                            if len(parts) > 1:
                                current_tx["referencia"] = parts[1].split()[0]

            if current_tx:
                transacciones.append(current_tx)
                
        return {
            "movements": transacciones,
            "summary": summary
        }
    except Exception as e:
        sys.stderr.write(f"Error procesando BBVA: {e}\n")
        return {"movements": [], "summary": summary}
