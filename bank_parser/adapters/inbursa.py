import pdfplumber
import re
import sys


def _group_lines(words, y_tolerance=4):
    """Agrupa palabras en líneas visuales por proximidad en Y."""
    if not words:
        return []
    words_sorted = sorted(words, key=lambda w: (round(w['top'] / y_tolerance), w['x0']))
    lines = []
    current_line = [words_sorted[0]]
    for w in words_sorted[1:]:
        if abs(w['top'] - current_line[-1]['top']) <= y_tolerance:
            current_line.append(w)
        else:
            lines.append(sorted(current_line, key=lambda x: x['x0']))
            current_line = [w]
    if current_line:
        lines.append(sorted(current_line, key=lambda x: x['x0']))
    return lines


def _detect_col_positions(pages):
    """
    Busca la fila de cabecera de la tabla de movimientos:
    FECHA | REFERENCIA | CONCEPTO | CARGOS | ABONOS | SALDO
    y devuelve el x-centro de cada columna de importe.
    Retorna dict {'cargo': x, 'abono': x, 'saldo': x} o None.
    """
    for page in pages:
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        if not words:
            continue
        lines = _group_lines(words)
        for line_words in lines:
            text_upper = " ".join(w['text'].upper() for w in line_words)
            if 'CARGOS' in text_upper and 'ABONOS' in text_upper and 'SALDO' in text_upper:
                cols = {}
                for w in line_words:
                    t = w['text'].upper()
                    xcenter = (w['x0'] + w['x1']) / 2
                    if t == 'CARGOS':
                        cols['cargo'] = xcenter
                    elif t == 'ABONOS':
                        cols['abono'] = xcenter
                    elif t == 'SALDO':
                        cols['saldo'] = xcenter
                if 'cargo' in cols and 'abono' in cols and 'saldo' in cols:
                    return cols
    return None


def _nearest_col(xcenter, col_positions):
    """Devuelve el nombre de la columna más cercana al x-centro dado."""
    return min(col_positions, key=lambda k: abs(xcenter - col_positions[k]))


def _is_money(text):
    """True si el texto parece un importe tipo 4,166.00 o 480.00 o 2.14"""
    return bool(re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2}$', text))


def _is_spei_detail_line(text_upper):
    """
    True si la línea es una línea de detalle SPEI que no debe incluirse en concepto:
    - Línea con número de cuenta bancaria largo (>=10 dígitos)
    - Línea con "RFC NO DISPONIBLE" o patrón de folio SAT
    - Línea con un banco conocido + número de cuenta
    """
    if 'RFC NO DISPONIBLE' in text_upper:
        return True
    # Folio SAT: alfanumérico largo con dígitos, ej. "036APPM05022026254058156"
    if re.search(r'\b[A-Z0-9]{15,}\b', text_upper) and re.search(r'\d{8,}', text_upper):
        return True
    # Número de cuenta bancaria puro (>=10 dígitos consecutivos)
    if re.search(r'\b\d{10,}\b', text_upper):
        return True
    return False


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

    meses_str = {
        "ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04",
        "MAY": "05", "JUN": "06", "JUL": "07", "AGO": "08",
        "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = str(__import__('datetime').date.today().year)

            # ─── PARTE 1: CARÁTULA (página 1) ────────────────────────────────
            first_page = pdf.pages[0]
            page_text = first_page.extract_text() or ""

            # Número de cuenta
            cuenta_match = re.search(r'(?:CUENTA|CTA)[:\s]+([\d\-]+)', page_text)
            if cuenta_match:
                summary["account_number"] = cuenta_match.group(1).strip()

            # CLABE como fallback
            clabe_match = re.search(r'CLABE\s+(\d{18})', page_text)
            if clabe_match and summary["account_number"] == "PREDETERMINADA":
                summary["account_number"] = clabe_match.group(1)

            # Cliente Inbursa (número de cliente)
            cliente_match = re.search(r'Cliente\s+Inbursa[:\s]+(\d+)', page_text, re.IGNORECASE)
            if cliente_match and summary["account_number"] == "PREDETERMINADA":
                summary["account_number"] = cliente_match.group(1)

            # Año del periodo
            year_match = re.search(r'(?:PERIODO|Del)\s+.*?(\d{4})', page_text)
            if year_match:
                year_str = year_match.group(1)

            # Periodo legible
            period_full = re.search(
                r'PERIODO\s+Del\s+([\d\w\s]+?)\s+al\s+([\d\w\s]+?)(?:\n|\r|$)',
                page_text, re.IGNORECASE
            )
            if period_full:
                summary["period"] = f"{period_full.group(1).strip()} - {period_full.group(2).strip()}"

            # Saldos del resumen en carátula
            words_first = first_page.extract_words()
            lines_first = _group_lines(words_first)
            found_summary = set()
            targets = [
                (r'SALDO\s+ANTERIOR', 'initial_balance'),
                (r'SALDO\s+ACTUAL',   'final_balance'),
                (r'^ABONOS$',         'total_abonos'),
                (r'^CARGOS$',         'total_cargos'),
            ]
            for line_words in lines_first:
                line_txt = " ".join(w['text'].upper() for w in line_words)
                for pattern, key in targets:
                    if key in found_summary:
                        continue
                    if re.search(pattern, line_txt):
                        for cand in reversed(line_words):
                            clean = cand['text'].replace('$', '').replace(',', '')
                            if re.match(r'^-?[\d]+\.\d{2}$', clean):
                                summary[key] = float(clean)
                                found_summary.add(key)
                                break

            # ─── PARTE 1.5: DETECTAR POSICIONES DINÁMICAS DE COLUMNAS ────────
            col_positions = _detect_col_positions(pdf.pages)

            # Fallback si no se detectaron (proporciones típicas de página Inbursa ~595pt)
            if not col_positions:
                col_positions = {'cargo': 440.0, 'abono': 510.0, 'saldo': 570.0}

            # ─── PARTE 2: EXTRAER MOVIMIENTOS ────────────────────────────────
            # Estado: SEARCHING → EXTRACTING → FINISHED
            # FINISHED ocurre al encontrar "SI DESEA RECIBIR PAGOS" que marca
            # el fin de la cuenta principal (antes de la cuenta de inversiones).
            state = "SEARCHING"
            current_tx = None

            for page in pdf.pages:
                if state == "FINISHED":
                    break

                words = page.extract_words(x_tolerance=2, y_tolerance=3)
                if not words:
                    continue

                lines = _group_lines(words)

                # Límites de la zona de movimientos en esta página
                start_y = 0
                cutoff_y = page.height

                for line_words in lines:
                    text_upper = " ".join(w['text'].upper() for w in line_words)

                    if "DETALLE DE MOVIMIENTOS" in text_upper and state != "FINISHED":
                        state = "EXTRACTING"

                    if ("FECHA" in text_upper and "CONCEPTO" in text_upper
                            and "SALDO" in text_upper):
                        # Cabecera de tabla → los movimientos empiezan debajo
                        start_y = line_words[0]['bottom'] + 1

                    # Fin de cuenta principal
                    if "SI DESEA RECIBIR PAGOS" in text_upper:
                        cutoff_y = line_words[0]['top'] - 2
                        state = "FINISHED"
                        break

                if state == "SEARCHING":
                    continue

                for line_words in lines:
                    top = line_words[0]['top']
                    if top <= start_y or top >= cutoff_y:
                        continue

                    text_line = " ".join(w['text'] for w in line_words)
                    text_upper = text_line.upper()

                    # ── Nueva transacción si la línea empieza con fecha "FEB. 05" ──
                    date_match = re.match(r'^([A-Z]{3})\.?\s+(\d{2})\b', text_upper)

                    if date_match:
                        if current_tx:
                            transacciones.append(current_tx)

                        mes_abbr = date_match.group(1).replace('.', '')
                        dia = date_match.group(2)
                        mes = meses_str.get(mes_abbr, "01")

                        current_tx = {
                            "banco": "INBURSA",
                            "fecha": f"{year_str}-{mes}-{dia}",
                            "concepto": "",
                            "referencia": "",
                            "cargo": 0.0,
                            "abono": 0.0,
                            "saldo": 0.0,
                        }

                        # Referencia: número puro en la columna 2 (~70-180px)
                        for w in line_words:
                            if 60 < w['x0'] < 200 and re.match(r'^\d{6,}$', w['text']):
                                current_tx["referencia"] = w['text']
                                break

                    if not current_tx:
                        continue

                    # ── Líneas de detalle SPEI: solo tomar texto descriptivo ──
                    # Nunca tomar líneas con cuentas bancarias largas / folios SAT / RFC
                    if _is_spei_detail_line(text_upper):
                        continue

                    # ── Procesar palabras de esta línea ──────────────────────
                    desc_parts = []
                    for w in line_words:
                        txt = w['text']
                        x0 = w['x0']
                        x1 = w['x1']
                        xcenter = (x0 + x1) / 2

                        # Saltar columnas de fecha y referencia
                        if x1 < 150:
                            continue

                        if _is_money(txt):
                            val = float(txt.replace(',', ''))
                            col = _nearest_col(xcenter, col_positions)
                            # Solo asignar si es mayor o si aún es 0 (evita sobreescribir con 0.01 de IVA)
                            if val > 0:
                                current_tx[col] = val
                        else:
                            # Solo agregar al concepto si está en la zona de descripción
                            if x0 < col_positions.get('cargo', 420) - 10:
                                desc_parts.append(txt)

                    inc = " ".join(desc_parts).strip()
                    if inc:
                        sep = " " if current_tx["concepto"] else ""
                        current_tx["concepto"] = (current_tx["concepto"] + sep + inc).strip()

            if current_tx:
                transacciones.append(current_tx)

        # Filtrar vacíos
        transacciones = [
            t for t in transacciones
            if t["concepto"] or t["cargo"] > 0 or t["abono"] > 0
        ]

        return {
            "movements": transacciones,
            "summary": summary
        }

    except Exception as e:
        import traceback
        sys.stderr.write(f"Error procesando INBURSA: {e}\n{traceback.format_exc()}\n")
        return {"movements": [], "summary": summary}
