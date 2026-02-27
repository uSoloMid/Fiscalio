import pdfplumber
import re
import sys

def extract_banamex(pdf_path):
    transacciones = []
    meses_str = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06", 
                 "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"}
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2026"
            in_details = False
            current_tx = None
            stop_all = False
            
            # Buscar el año global
            first_text = pdf.pages[0].extract_text() or ""
            ym = re.search(r"AL \d{2} DE ([A-Z]+) DE (\d{4})", first_text)
            if ym: 
                year_str = ym.group(2)

            for page in pdf.pages:
                if stop_all: break
                
                # Extraemos las palabras exactas con su ubicación X e Y (evita usar layout=True ambiguo)
                words = page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False)
                if not words: continue
                
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

                # --- BARRERA GEOMÉTRICA (COORDENADA Y) ---
                # Como lo sugirió el usuario, encontramos la altura (Y) exacta donde empieza el área de saldos promedio / comisiones
                # y cortamos la hoja entera a esa altura.
                cutoff_y = page.height
                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    if any(kw in text_line for kw in ["Banca Electrónica Empresarial", "SALDO PROMEDIO MINIMO", "COMISIONES COBRADAS"]):
                        cutoff_y = min(cutoff_y, line_words[0]['top'] - 2) # Margen de 2 pixeles hacia arriba
                        stop_all = True # Que ya no lea más páginas después de esta
                        break
                        
                # Filtramos las líneas que están más abajo de la barrera
                valid_lines = [lw for lw in lines if lw[0]['top'] < cutoff_y]

                for line_words in valid_lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    
                    if "DETALLE DE OPERACIONES" in text_line:
                        in_details = True
                        continue
                    
                    if not in_details: continue
                    
                    if "SALDO ANTERIOR" in text_line:
                        continue
                        
                    first_word = line_words[0]
                    date_match = None
                    
                    # Una fecha suele estar pegada al margen izquierdo (x0 < 60)
                    if first_word['x0'] < 60 and len(line_words) >= 2:
                        match_str = f"{line_words[0]['text']} {line_words[1]['text']}"
                        date_match = re.match(r"^(\d{2}) ([A-Z]{3})$", match_str)
                        
                    # Si detectamos inicio de un movimiento nuevo
                    if date_match and "SALDO" not in text_line and "CAJA" not in text_line:
                        # Guardar el movimiento que ya traíamos
                        if current_tx:
                            transacciones.append(current_tx)
                            
                        dia = date_match.group(1)
                        mes = meses_str.get(date_match.group(2), "01")
                        fecha_format = f"{year_str}-{mes}-{dia}"
                        
                        current_tx = {
                            "banco": "BANAMEX",
                            "fecha": fecha_format,
                            "concepto": "",
                            "referencia": "",
                            "cargo": 0.0,
                            "abono": 0.0,
                            "saldo": 0.0
                        }
                    
                    if current_tx:
                        desc_parts = []
                        for i, w in enumerate(line_words):
                            text_w = w['text']
                            x1 = w['x1']
                            x0 = w['x0']
                            
                            # Ignorar las primeras palabras si son "06 ENE" pegadas a la izquierda
                            if i < 2 and x0 < 60 and text_w in [current_tx["fecha"][-2:], meses_str.get(date_match.group(2) if date_match else "", "")] or (date_match and i < 2):
                                continue
                            
                            # Regex estricto: ¿Esta palabra es Cifra Financiera (.00)?
                            if re.match(r"^-?\d{1,3}(,\d{3})*\.\d{2}$", text_w):
                                val = float(text_w.replace(",", ""))
                                
                                # LECTURA GEOMÉTRICA (En milímetros desde la izquierda)
                                # Cargos (Retiros): x1 suele estar cerca del pixel 316
                                # Abonos (Depositos): x1 suele estar cerca del pixel 395
                                # Saldo: x1 suele estar cerca del pixel 472
                                if 250 <= x1 <= 330:
                                    current_tx["cargo"] = val
                                elif 331 <= x1 <= 410:
                                    current_tx["abono"] = val
                                elif x1 >= 411:
                                    current_tx["saldo"] = val
                            else:
                                # Todo lo demas es parte de las descripciones del banco (sucursal, etc.)
                                desc_parts.append(text_w)
                                
                        concepto_limpio = " ".join(desc_parts)
                        current_tx["concepto"] = (current_tx["concepto"] + " " + concepto_limpio).strip()
                        
                        # Intentar sacar referencia limpia de RASTREO: o REF.
                        ref_match = re.search(r"(REF\.|RASTREO:)\s*([A-Z0-9]+)", current_tx["concepto"])
                        if ref_match: current_tx["referencia"] = ref_match.group(2)

            if current_tx:
                transacciones.append(current_tx)
                
        return transacciones
    except Exception as e:
        sys.stderr.write(f"Error procesando Banamex: {e}\n")
        return []
