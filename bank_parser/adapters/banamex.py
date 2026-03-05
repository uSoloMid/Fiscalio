import pdfplumber
import re
import sys
import unicodedata

def _strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')

def extract_banamex(pdf_path):
    transacciones = []
    meses_str = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05", "JUN": "06",
                 "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"}

    summary = {
        "initial_balance": None,
        "final_balance": None,
        "period": "",
        "account_number": "PREDETERMINADA"
    }

    # Detección dinámica de columnas a partir del encabezado DETALLE DE OPERACIONES
    # Se llena cuando encontramos la fila FECHA | CONCEPTO | RETIROS | DEPOSITOS | SALDO
    col_centers = {}  # {"RETIROS": x_center, "DEPOSITOS": x_center, "SALDO": x_center}

    # Regex para filtrar líneas de referencia de pie de página (ej: "003180.B09CHDA10.AR.0228.01")
    PAGE_REF_RE = re.compile(r"^\d{6,}\.[A-Z0-9]+\.", re.I)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2026"
            in_details = False
            current_tx = None
            stop_all = False

            # --- PARTE 1: METADATOS (Página 1) ---
            first_page = pdf.pages[0]
            first_text = first_page.extract_text() or ""

            # 1. Detectar Periodo: AL 28 DE FEBRERO DE 2026
            ym = re.search(r"AL\s+(\d{2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})", first_text, re.I)
            if ym:
                year_str = ym.group(3)
                month_name = ym.group(2).upper()
                summary["period"] = f"{month_name[:3]}-{year_str}"

            # 2. Detectar No. Cuenta / Cliente
            acc_match = re.search(r"CLIENTE:\s+(\d+)", first_text, re.I)
            if acc_match:
                summary["account_number"] = acc_match.group(1)
            # Fallback: CONTRATO
            if summary["account_number"] == "PREDETERMINADA":
                cont_match = re.search(r"CONTRATO\s+(\d{8,})", first_text, re.I)
                if cont_match:
                    summary["account_number"] = cont_match.group(1)

            # 3. RFC (Registro Federal de Contribuyentes)
            rfc_match = re.search(
                r"Registro Federal de Contribuyentes[:\s]+([A-Z&]{3,4}\d{6}[A-Z0-9]{3})",
                first_text, re.I
            )
            if rfc_match:
                summary["rfc"] = rfc_match.group(1).upper()

            # 4. Detectar Balances en carátula
            words_p1 = first_page.extract_words()
            for i, w in enumerate(words_p1):
                txt = w['text'].upper()
                # Saldo Anterior / ANTERIOR
                if "ANTERIOR" in txt:
                    for next_w in words_p1[i+1:i+15]:
                        if abs(next_w['top'] - w['top']) < 10:
                            clean = next_w['text'].replace("$","").replace(",","")
                            try:
                                summary["initial_balance"] = float(clean)
                                break
                            except: pass
                # SALDO AL ... (saldo final en Banamex)
                if txt == "SALDO" and i + 1 < len(words_p1):
                    next_txt = words_p1[i+1]['text'].upper()
                    if next_txt == "AL":
                        # Buscar el monto en la misma línea
                        for next_w in words_p1[i+1:i+20]:
                            if abs(next_w['top'] - w['top']) < 10:
                                clean = next_w['text'].replace("$","").replace(",","")
                                try:
                                    val = float(clean)
                                    if val > 0:
                                        summary["final_balance"] = val
                                        break
                                except: pass
                # Fallbacks legacy: ACTUAL / FINAL
                if "ACTUAL" in txt or "FINAL" in txt:
                    for next_w in words_p1[i+1:i+10]:
                        if abs(next_w['top'] - w['top']) < 10:
                            clean = next_w['text'].replace("$","").replace(",","")
                            try:
                                summary["final_balance"] = float(clean)
                                break
                            except: pass

            # --- PARTE 2: MOVIMIENTOS ---
            for page in pdf.pages:
                if stop_all: break

                words = page.extract_words(x_tolerance=3, y_tolerance=3)
                if not words: continue

                # Agrupar palabras en líneas
                lines = []
                words.sort(key=lambda w: (round(w['top']), w['x0']))

                current_line = [words[0]]
                for w in words[1:]:
                    if abs(w['top'] - current_line[-1]['top']) <= 4:
                        current_line.append(w)
                    else:
                        lines.append(current_line)
                        current_line = [w]
                if current_line:
                    lines.append(current_line)

                STOP_KEYWORDS = [
                    "BANCA ELECTRÓNICA",
                    "BANCA ELECTRONICA",
                    "SALDO PROMEDIO MINIMO",
                    "COMISIONES COBRADAS",
                    "TOTAL DE OPERACIONES",
                ]

                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    text_upper = text_line.upper()

                    # Encabezado de sección de movimientos
                    if "DETALLE DE OPERACIONES" in text_upper:
                        in_details = True
                        continue

                    if not in_details:
                        continue

                    # Stop keywords (solo dentro de DETALLE, no en el resumen de carátula)
                    if any(kw in text_upper for kw in STOP_KEYWORDS):
                        stop_all = True
                        break

                    # Fila de encabezado de columnas → detectar posiciones dinámicamente
                    text_norm = _strip_accents(text_upper)
                    if "RETIROS" in text_norm and "DEPOSITOS" in text_norm and "SALDO" in text_norm:
                        col_centers = {}
                        for w in line_words:
                            wt = _strip_accents(w['text'].upper())
                            if wt in ("RETIROS", "DEPOSITOS", "SALDO"):
                                col_centers[wt] = (w['x0'] + w['x1']) / 2
                        sys.stderr.write(f"[BANAMEX-DEBUG] col_centers: {col_centers}\n")
                        continue

                    # Saltar fila "SALDO ANTERIOR" de la tabla
                    if "SALDO ANTERIOR" in text_upper:
                        # Pero extraer el saldo inicial si aún no lo tenemos
                        if summary["initial_balance"] is None:
                            for w in line_words:
                                if re.match(r"^[\d,]+\.\d{2}$", w['text']):
                                    try:
                                        summary["initial_balance"] = float(w['text'].replace(",",""))
                                    except: pass
                        continue

                    # Filtrar líneas de referencia de pie de página
                    if len(line_words) <= 2 and PAGE_REF_RE.match(text_line.strip()):
                        continue

                    # Detectar nueva transacción por fecha (DD MMM al inicio de línea)
                    first_word = line_words[0]
                    date_match = None
                    if first_word['x0'] < 80 and len(line_words) >= 2:
                        match_str = f"{line_words[0]['text']} {line_words[1]['text']}"
                        date_match = re.match(r"^(\d{2})\s+([A-Z]{3})$", match_str.strip().upper())

                    # Solo filtrar filas estructurales (SALDO ANTERIOR, SALDO AL DD MMM)
                    # NO filtrar transacciones que en su concepto mencionen "SALDO"
                    _is_balance_row = "SALDO ANTERIOR" in text_upper or bool(re.search(r"SALDO\s+AL\s+\d{2}", text_upper))
                    if date_match and not _is_balance_row:
                        if current_tx:
                            transacciones.append(current_tx)
                        dia = date_match.group(1)
                        mes = meses_str.get(date_match.group(2), "01")
                        current_tx = {
                            "banco": "BANAMEX",
                            "fecha": f"{year_str}-{mes}-{dia}",
                            "concepto": "",
                            "referencia": "",
                            "cargo": 0.0,
                            "abono": 0.0,
                            "saldo": 0.0
                        }

                    if current_tx is None:
                        continue

                    desc_parts = []
                    for i, w in enumerate(line_words):
                        tw = w['text']
                        # Saltar las dos primeras palabras de fecha si es una fila con fecha
                        if date_match and i < 2 and w['x0'] < 80:
                            continue

                        # Detectar monto numérico
                        if re.match(r"^-?[\d,]+\.\d{2}$", tw):
                            val = float(tw.replace(",", ""))
                            w_center = (w['x0'] + w['x1']) / 2

                            if col_centers:
                                # Asignar usando fronteras de punto medio entre columnas.
                                # Cada píxel pertenece a exactamente UNA columna (sin zonas de overlap).
                                cols_sorted = sorted(col_centers.items(), key=lambda x: x[1])
                                # cols_sorted: [(nombre, centro), ...] ordenado por posición X
                                assigned = None
                                if len(cols_sorted) >= 2:
                                    # Calcular fronteras (midpoints entre columnas adyacentes)
                                    boundaries = []
                                    for i in range(len(cols_sorted) - 1):
                                        mid = (cols_sorted[i][1] + cols_sorted[i+1][1]) / 2
                                        boundaries.append(mid)
                                    # Determinar a qué segmento pertenece w_center
                                    seg = 0
                                    for b in boundaries:
                                        if w_center >= b:
                                            seg += 1
                                    assigned = cols_sorted[seg][0]
                                elif len(cols_sorted) == 1:
                                    assigned = cols_sorted[0][0]

                                sys.stderr.write(f"[BANAMEX-DEBUG] monto={val} x_center={w_center:.1f} assigned={assigned} cols={cols_sorted}\n")
                                if assigned == "RETIROS":
                                    current_tx["cargo"] = val
                                elif assigned == "DEPOSITOS":
                                    current_tx["abono"] = val
                                elif assigned == "SALDO":
                                    current_tx["saldo"] = val
                            else:
                                # Fallback con rangos hardcodeados
                                x1 = w['x1']
                                sys.stderr.write(f"[BANAMEX-DEBUG] FALLBACK monto={val} x1={x1} (no col_centers)\n")
                                if 240 <= x1 <= 345:
                                    current_tx["cargo"] = val
                                elif 346 <= x1 <= 435:
                                    current_tx["abono"] = val
                                elif x1 >= 436:
                                    current_tx["saldo"] = val
                        else:
                            desc_parts.append(tw)

                    inc_desc = " ".join(desc_parts).strip()
                    if inc_desc:
                        current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()

                    # Extraer referencia/rastreo del concepto acumulado
                    ref_match = re.search(
                        r"(?:REF\.?|RASTREO:?)\s*([A-Z0-9]{6,})",
                        current_tx["concepto"].upper()
                    )
                    if ref_match:
                        current_tx["referencia"] = ref_match.group(1)

            if current_tx:
                transacciones.append(current_tx)

        return {"movements": transacciones, "summary": summary}

    except Exception as e:
        sys.stderr.write(f"Error procesando Banamex: {e}\nimport traceback; traceback.print_exc()\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {"movements": [], "summary": summary}
