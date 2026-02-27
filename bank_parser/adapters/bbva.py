import pdfplumber
import re
import sys

def extract_bbva(pdf_path):
    transacciones = []
    # Meses en español para BBVA
    meses_str = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06", 
                 "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"}
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2026"
            in_details = False
            current_tx = None
            stop_all = False
            
            # Buscar el año global en la primera página
            first_page_text = pdf.pages[0].extract_text() or ""
            # Ejemplo: DEL 01/02/2025 AL 28/02/2025
            ym = re.search(r"AL (\d{2})/(\d{2})/(\d{4})", first_page_text)
            if ym: 
                year_str = ym.group(3)

            for page in pdf.pages:
                if stop_all: break
                
                words = page.extract_words(x_tolerance=2, y_tolerance=3)
                if not words: continue
                
                # Agrupamos en líneas visuales
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
                        start_y = line_words[0]['bottom'] + 10 # Un poco abajo del título
                        in_details = True
                        break
                
                # Filtramos líneas por el "Cuadro" de transacciones
                valid_lines = [lw for lw in lines if lw[0]['top'] > start_y and lw[0]['top'] < cutoff_y]

                for line_words in valid_lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    
                    # Ignorar encabezados de tabla repetidos en cada página
                    if "FECHA" in text_line and "SALDO" in text_line:
                        continue
                    if "OPER LIQ" in text_line or "CARGOS ABONOS" in text_line:
                        continue
                    # Ignorar avisos de "Estimado Cliente" o basurilla legal al pie de página si cutoff fallara
                    if "Estimado Cliente" in text_line or "La GAT Real" in text_line:
                        continue

                    # Buscar fecha al inicio: 01/FEB
                    first_word = line_words[0]['text']
                    date_match = re.match(r"^(\d{2})/([A-Z]{3})$", first_word)

                    if date_match:
                        # Guardar anterior
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
                            
                            # Si es la fecha de la columna OPER o LIQ (01/FEB), la saltamos para el concepto
                            if re.match(r"^\d{2}/[A-Z]{3}$", tw) and i < 3:
                                continue
                            
                            # Identificar montos por posición X (Geometría)
                            # Basado en investigación: Cargos x1 ~ 420, Abonos x1 ~ 460, Saldo x1 ~ 595
                            if re.match(r"^-?\d{1,3}(,\d{3})*\.\d{2}$", tw):
                                val = float(tw.replace(",", ""))
                                if 330 < x1 <= 425:
                                    current_tx["cargo"] = val
                                elif 425 < x1 <= 485:
                                    current_tx["abono"] = val
                                elif x1 > 485:
                                    # BBVA tiene dos columnas de saldo (Operación y Liquidación)
                                    # Tomamos la de Operación (primera que encontremos > 485)
                                    if current_tx["saldo"] == 0:
                                        current_tx["saldo"] = val
                            else:
                                # Capturar referencia si viene con prefijo "Ref."
                                if "Ref." in tw:
                                    # Intentar sacar lo que sigue a Ref.
                                    # El usuario pidió que Concepto y Referencia se tomen juntos si están pegados
                                    pass
                                desc_parts.append(tw)
                        
                        inc_desc = " ".join(desc_parts)
                        if inc_desc:
                            current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()
                        
                        # Extraer referencia del concepto si existe
                        if "Ref. " in current_tx["concepto"]:
                            parts = current_tx["concepto"].split("Ref. ")
                            if len(parts) > 1:
                                current_tx["referencia"] = parts[1].split()[0] # Primer bloque después de Ref.

            if current_tx:
                transacciones.append(current_tx)
                
        return transacciones
    except Exception as e:
        sys.stderr.write(f"Error procesando BBVA: {e}\n")
        return []
