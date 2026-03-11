import re
import sys
import os


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


def _fitz_words(page):
    """
    Extrae palabras de una página fitz y las convierte al formato
    dict compatible con el resto del parser (como pdfplumber).
    """
    raw = page.get_text("words")   # (x0, y0, x1, y1, text, block, line, idx)
    return [
        {'x0': w[0], 'top': w[1], 'x1': w[2], 'bottom': w[3], 'text': w[4]}
        for w in raw
        if w[4].strip()
    ]


def _detect_col_positions(pages_words):
    """
    Busca la fila de cabecera FECHA | REFERENCIA | CONCEPTO | CARGOS | ABONOS | SALDO
    y devuelve el x1 (borde derecho) de cada columna de importe.
    pages_words: lista de listas de words (una por página).
    """
    for words in pages_words:
        lines = _group_lines(words)
        for line_words in lines:
            text_upper = " ".join(w['text'].upper() for w in line_words)
            if ('FECHA' in text_upper and 'CARGOS' in text_upper
                    and 'ABONOS' in text_upper and 'SALDO' in text_upper):
                cols = {}
                for w in line_words:
                    t = w['text'].upper()
                    if t == 'CARGOS':
                        cols['cargo'] = w['x1']
                    elif t == 'ABONOS':
                        cols['abono'] = w['x1']
                    elif t == 'SALDO':
                        cols['saldo'] = w['x1']
                if 'cargo' in cols and 'abono' in cols and 'saldo' in cols:
                    return cols
    return None


def _is_money(text):
    """
    True si el texto parece un importe monetario.
    Acepta: 4,166.00 | 4166.00 | 480.00 | 2.14
    Normaliza separadores de miles alternativos.
    """
    normalized = re.sub(r'[\s,\u202f\xa0]', '', text)
    return bool(re.match(r'^\d+\.\d{2}$', normalized))


def _is_spei_detail_line(text_upper):
    """
    True si la línea es de detalle SPEI (no incluir en concepto, no parsear importes).
    Solo se aplica a líneas de CONTINUACIÓN (sin fecha).
    """
    if 'RFC NO DISPONIBLE' in text_upper:
        return True
    if re.search(r'\b[A-Z0-9]{15,}\b', text_upper) and re.search(r'\d{8,}', text_upper):
        return True
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
        import fitz

        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            return {"movements": [], "summary": summary}

        year_str = str(__import__('datetime').date.today().year)

        # ─── PARTE 1: CARÁTULA (página 1) ────────────────────────────────
        first_page_text = doc[0].get_text() or ""

        # Número de cuenta
        cuenta_match = re.search(r'(?:CUENTA|CTA)[:\s]+([\d\-]+)', first_page_text)
        if cuenta_match:
            summary["account_number"] = cuenta_match.group(1).strip()

        clabe_match = re.search(r'CLABE\s+(\d{18})', first_page_text)
        if clabe_match and summary["account_number"] == "PREDETERMINADA":
            summary["account_number"] = clabe_match.group(1)

        cliente_match = re.search(r'Cliente\s+Inbursa[:\s]+(\d+)', first_page_text, re.IGNORECASE)
        if cliente_match and summary["account_number"] == "PREDETERMINADA":
            summary["account_number"] = cliente_match.group(1)

        year_match = re.search(r'(?:PERIODO|Del)\s+.*?(\d{4})', first_page_text)
        if year_match:
            year_str = year_match.group(1)

        period_full = re.search(
            r'PERIODO\s+Del\s+([\d\w\s]+?)\s+al\s+([\d\w\s]+?)(?:\n|\r|$)',
            first_page_text, re.IGNORECASE
        )
        if period_full:
            summary["period"] = f"{period_full.group(1).strip()} - {period_full.group(2).strip()}"

        # Saldos del resumen en carátula
        words_first = _fitz_words(doc[0])
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
                        clean = re.sub(r'[\s,\u202f\xa0$]', '', cand['text'])
                        if re.match(r'^-?\d+\.\d{2}$', clean):
                            summary[key] = float(clean)
                            found_summary.add(key)
                            break

        # ─── PARTE 1.5: DETECTAR POSICIONES DINÁMICAS DE COLUMNAS ────────
        all_pages_words = [_fitz_words(doc[i]) for i in range(len(doc))]
        col_positions = _detect_col_positions(all_pages_words)

        if not col_positions:
            sys.stderr.write("[INBURSA-DEBUG] col_positions no detectado — usando fallback\n")
            col_positions = {'cargo': 440.0, 'abono': 510.0, 'saldo': 570.0}
        else:
            sys.stderr.write(f"[INBURSA-DEBUG] col_positions={col_positions}\n")

        # ─── PARTE 2: EXTRAER MOVIMIENTOS ────────────────────────────────
        state = "SEARCHING"
        current_tx = None

        for page_idx, page in enumerate(doc):
            if state == "FINISHED":
                break

            words = all_pages_words[page_idx]
            if not words:
                continue

            lines = _group_lines(words)
            page_height = page.rect.height

            start_y = 0
            cutoff_y = page_height

            # Primera pasada: detectar límites y estado
            for line_words in lines:
                text_upper = " ".join(w['text'].upper() for w in line_words)

                if "DETALLE DE MOVIMIENTOS" in text_upper and state != "FINISHED":
                    state = "EXTRACTING"

                if ("FECHA" in text_upper and "CONCEPTO" in text_upper
                        and "SALDO" in text_upper):
                    start_y = line_words[0]['bottom'] + 1

                if "SI DESEA RECIBIR PAGOS" in text_upper:
                    cutoff_y = line_words[0]['top'] - 2
                    state = "FINISHED"
                    break

            if state == "SEARCHING":
                continue

            # Segunda pasada: parsear transacciones
            for line_words in lines:
                top = line_words[0]['top']
                if top <= start_y or top >= cutoff_y:
                    continue

                text_line = " ".join(w['text'] for w in line_words)
                text_upper = text_line.upper()

                date_match = re.match(r'^([A-Z]{3})\.?\s+(\d{2})\b', text_upper)

                if date_match:
                    if current_tx:
                        transacciones.append(current_tx)
                    sys.stderr.write(f"[INBURSA-DEBUG] nueva tx fecha={date_match.group(0).strip()}\n")

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

                    for w in line_words:
                        if 60 < w['x0'] < 200 and re.match(r'^\d{6,}$', w['text']):
                            current_tx["referencia"] = w['text']
                            break

                if not current_tx:
                    continue

                # Filtrar líneas de detalle SPEI solo en continuaciones
                if not date_match and _is_spei_detail_line(text_upper):
                    continue

                # Procesar palabras de la línea
                desc_parts = []
                money_on_line = []

                for w in line_words:
                    txt = w['text']
                    x0 = w['x0']
                    x1 = w['x1']

                    if x1 < 150:
                        continue

                    if _is_money(txt):
                        normalized = re.sub(r'[\s,\u202f\xa0]', '', txt)
                        val = float(normalized)
                        if val > 0:
                            money_on_line.append((x1, val))
                    else:
                        if x0 < col_positions.get('cargo', 420) - 10:
                            desc_parts.append(txt)

                if date_match and not money_on_line:
                    raw_words = [(w['text'], round(w['x0']), round(w['x1'])) for w in line_words]
                    sys.stderr.write(f"[INBURSA-DEBUG] tx sin importes, palabras={raw_words}\n")

                # Asignar: rightmost = SALDO, resto por punto medio cargo/abono
                if money_on_line:
                    money_on_line.sort(key=lambda t: t[0])
                    current_tx['saldo'] = money_on_line[-1][1]
                    mid = (col_positions['cargo'] + col_positions['abono']) / 2
                    for x1_val, val in money_on_line[:-1]:
                        if x1_val <= mid:
                            current_tx['cargo'] = val
                        else:
                            current_tx['abono'] = val

                inc = " ".join(desc_parts).strip()
                if inc:
                    sep = " " if current_tx["concepto"] else ""
                    current_tx["concepto"] = (current_tx["concepto"] + sep + inc).strip()

        if current_tx:
            transacciones.append(current_tx)

        doc.close()

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
