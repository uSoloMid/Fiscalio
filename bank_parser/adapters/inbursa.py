import re
import sys
import os
import subprocess
import tempfile


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
    raw = page.get_text("words")
    return [
        {'x0': w[0], 'top': w[1], 'x1': w[2], 'bottom': w[3], 'text': w[4]}
        for w in raw
        if w[4].strip()
    ]


def _detect_col_positions(pages_words):
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
    normalized = re.sub(r'[\s,\u202f\xa0]', '', text)
    return bool(re.match(r'^\d+\.\d{2}$', normalized))


def _is_spei_detail_line(text_upper):
    if 'RFC NO DISPONIBLE' in text_upper:
        return True
    if re.search(r'\b[A-Z0-9]{15,}\b', text_upper) and re.search(r'\d{8,}', text_upper):
        return True
    if re.search(r'\b\d{10,}\b', text_upper):
        return True
    return False


def _is_obfuscated_pdf(doc):
    """
    Detecta si el PDF de Inbursa usa el font AllAndNone ofuscado.
    En ese caso la extracción de texto normal falla.
    """
    try:
        # Leer rawdict de la primera página con movimientos (pag 2 normalmente)
        page_idx = min(1, len(doc) - 1)
        page = doc[page_idx]
        d = page.get_text('rawdict')
        for block in d.get('blocks', []):
            if block.get('type') != 0:
                continue
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    font_name = span.get('font', '')
                    if 'AllAndNone' in font_name or 'allAndNone' in font_name:
                        sys.stderr.write(f"[INBURSA-OBFUSCATED] font check triggered: {font_name}\n")
                        return True
        # Fallback: el font AllAndNone mapea caracteres al área privada Unicode (>0xE000)
        # NO usar ord>200 porque las letras acentuadas del español también superan ese valor
        text = page.get_text()
        sys.stderr.write(f"[INBURSA-OBFUSCATED] font check passed, text len={len(text) if text else 0}\n")
        if text:
            private_use = sum(1 for c in text if ord(c) > 0xE000)
            ratio = private_use / max(len(text), 1)
            sys.stderr.write(f"[INBURSA-OBFUSCATED] private_use={private_use}, ratio={ratio:.4f}\n")
            if ratio > 0.10:
                sys.stderr.write(f"[INBURSA-OBFUSCATED] ratio check triggered\n")
                return True
    except Exception:
        pass
    return False


def _ocr_page_text(page, dpi=150):
    """
    Renderiza la página como imagen y devuelve texto OCR via tesseract.
    Retorna string con el texto OCR, o '' si falla.
    """
    try:
        import fitz
        mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=mat)
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            png_path = f.name
        pix.save(png_path)
        result = subprocess.run(
            ['tesseract', png_path, 'stdout', '-l', 'spa', '--psm', '6', '--oem', '3'],
            capture_output=True, text=True, timeout=30
        )
        os.unlink(png_path)
        return result.stdout
    except FileNotFoundError:
        sys.stderr.write("[INBURSA-OCR] tesseract no encontrado\n")
        return ''
    except Exception as e:
        sys.stderr.write(f"[INBURSA-OCR] error: {e}\n")
        return ''


def _parse_ocr_transactions(all_ocr_text, year_str, meses_str, initial_balance=None):
    """
    Parsea el texto OCR de todas las páginas de movimientos de Inbursa.
    Soporta 3 variantes de formato OCR:
      - "ENE. REFERENCIA CONCEPTO MONTO SALDO"  (día en línea siguiente)
      - "ENE. 02|REFERENCIA CONCEPTO MONTO SALDO"  (día inline con |)
      - "ENE. — [REFERENCIA — |CONCEPTO MONTO SALDO"  (con guiones como separadores)
    """
    # Grupo 1: mes | Grupo 2: día inline (opcional) | Grupo 3: referencia | Grupo 4: resto
    # Soporta: "ENE. 12[REF", "ENE. 12|REF", "ENE. 12 [REF", "3 ENE. 12 [REF"
    MESES_PAT = re.compile(
        r'^(?:\d{1,3}\s+)?'                # prefijo numérico opcional (nro de página OCR)
        r'(' + '|'.join(meses_str.keys()) + r')\.?\s+'
        r'(?:(\d{1,2})[\[|\s]+)?'          # día inline opcional (sep: [, |, o espacio)
        r'[^\d]{0,6}(\d{6,12})\s+'        # prefijo no-dígito (artefacto OCR) + referencia
        r'(.+)$',
        re.IGNORECASE
    )
    MONEY_PAT = re.compile(r'(\d{1,3}(?:,\d{3})*\.\d{2})')

    def _to_float(s):
        return float(s.replace(',', ''))

    def _clean_concepto(text):
        # Eliminar artefactos OCR del inicio: corchetes, guiones largos, ¡, |
        text = re.sub(r'^[¡!\|\[\u2014\u2013\-]+', '', text).strip()
        text = re.sub(r'[\|\!¡\[\u2014\u2013]', ' ', text).strip()
        text = re.sub(r'\s+', ' ', text)
        # Corregir doble-C inicial (CCUOTA → CUOTA, artefacto de borde de celda)
        if len(text) > 2 and text[0] == 'C' and text[1] == 'C' and text[2].isupper():
            text = text[1:]
        return text

    def _finalize_tx(tx, prev_sal):
        if tx is None:
            return prev_sal
        # Limpiar flag interno antes de retornar
        tx.pop('_day_found', None)
        sal = tx['saldo']
        if prev_sal is None:
            return sal
        diff = round(sal - prev_sal, 2)
        if diff > 0:
            tx['abono'] = round(abs(diff), 2)
            tx['cargo'] = 0.0
        else:
            tx['cargo'] = round(abs(diff), 2)
            tx['abono'] = 0.0
        return sal

    def _try_extract_day(line):
        """Intenta extraer día 1-31 del inicio de la línea, normalizando confusiones OCR."""
        # Caso especial: "[0XY" → OCR lee "| 05" como "[015" (días 01-09 con cero inicial)
        # El primer dígito tras "[0" es artefacto; el último es el dígito real del día.
        bracket_m = re.match(r'^\[0(\d)(\d)', line)
        if bracket_m:
            last_d = int(bracket_m.group(2))
            if last_d > 0:
                return last_d, bracket_m.end()

        # Normalizar O→0, S→5 solo si el primer token es muy corto (≤4 chars)
        first_tok = re.match(r'^\S+', line)
        line_norm = line
        if first_tok and len(first_tok.group()) <= 4 and re.search(r'[OSos]', first_tok.group()):
            tok = first_tok.group()
            norm = tok.replace('O', '0').replace('o', '0').replace('S', '5')
            line_norm = norm + line[len(tok):]
        dm = re.match(r'^[\D]{0,3}(\d{1,2})\b', line_norm)
        if dm:
            val = int(dm.group(1))
            if 1 <= val <= 31:
                return val, dm.end()
        return None, 0

    lines = all_ocr_text.split('\n')
    transactions = []
    current_tx = None
    prev_saldo = initial_balance

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if 'SI DESEA RECIBIR PAGOS' in line.upper():
            break

        # Ignorar línea de balance inicial (no es movimiento)
        if 'BALANCE INICIAL' in line.upper():
            continue

        m = MESES_PAT.match(line)
        if m:
            if current_tx:
                prev_saldo = _finalize_tx(current_tx, prev_saldo)
                transactions.append(current_tx)

            mes_abbr = m.group(1).upper()[:3]
            day_inline = m.group(2)   # puede ser None
            ref = m.group(3)
            rest = m.group(4)
            mes_num = meses_str.get(mes_abbr, "01")

            amounts = MONEY_PAT.findall(rest)
            if not amounts:
                continue

            saldo = _to_float(amounts[-1])

            concepto = rest
            for amt in amounts:
                idx = concepto.find(amt)
                if idx >= 0:
                    concepto = concepto[:idx].strip()
                    break
            concepto = _clean_concepto(concepto)

            if day_inline:
                fecha = f'{year_str}-{mes_num}-{int(day_inline):02d}'
                day_found = True
            else:
                fecha = f'{year_str}-{mes_num}-01'  # placeholder, día en línea siguiente
                day_found = False

            current_tx = {
                'banco': 'INBURSA',
                'fecha': fecha,
                'concepto': concepto,
                'referencia': ref,
                'cargo': 0.0,
                'abono': 0.0,
                'saldo': saldo,
                '_day_found': day_found,
            }
            continue

        if not current_tx:
            continue

        # Buscar día en línea de continuación (solo si aún no se encontró)
        if not current_tx.get('_day_found'):
            day_val, day_end = _try_extract_day(line)
            if day_val is not None:
                mes_part = current_tx['fecha'][:8]  # YYYY-MM-
                current_tx['fecha'] = mes_part + str(day_val).zfill(2)
                current_tx['_day_found'] = True
                rest_after_day = re.sub(r'^[\[\|\-¡!]+', '', line[day_end:].strip()).strip()
                if rest_after_day and not MONEY_PAT.search(rest_after_day):
                    current_tx['concepto'] = (current_tx['concepto'] + ' ' + rest_after_day).strip()
                continue

        # Línea de continuación — agregar al concepto si no es detalle técnico
        line_cont = re.sub(r'^[\[\|\-¡!]+', '', line).strip()  # limpiar artefactos iniciales
        if line_cont and not MONEY_PAT.search(line_cont) and len(line_cont) < 120:
            if not re.search(r'\b\d{10,}\b', line_cont) and 'RFC NO DISPONIBLE' not in line_cont.upper():
                current_tx['concepto'] = (current_tx['concepto'] + ' ' + line_cont).strip()

    if current_tx:
        prev_saldo = _finalize_tx(current_tx, prev_saldo)
        transactions.append(current_tx)

    return transactions


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

        # ─── CARÁTULA (página 1) ──────────────────────────────────────
        first_page_text = doc[0].get_text() or ""

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

        # Saldos de carátula
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

        # ─── DETECTAR SI PDF ESTÁ OFUSCADO ───────────────────────────
        obfuscated = _is_obfuscated_pdf(doc)

        if obfuscated:
            sys.stderr.write("[INBURSA] PDF ofuscado detectado — usando OCR\n")
            # Encontrar cuenta desde OCR de carátula si no se encontró
            ocr_cover = _ocr_page_text(doc[0])
            if summary["account_number"] == "PREDETERMINADA":
                cl_ocr = re.search(r'Cliente\s+Inbursa[:\s]+(\d+)', ocr_cover, re.IGNORECASE)
                if cl_ocr:
                    summary["account_number"] = cl_ocr.group(1)
            if not summary.get("period"):
                per_ocr = re.search(
                    r'Del\s+([\d\w\s]+?)\s+al\s+([\d\w\s]+?)(?:\n|\r|$)',
                    ocr_cover, re.IGNORECASE
                )
                if per_ocr:
                    summary["period"] = f"{per_ocr.group(1).strip()} - {per_ocr.group(2).strip()}"
            # Saldos desde OCR carátula si no se encontraron
            if 'initial_balance' not in found_summary:
                m = re.search(r'SALDO\s+ANTERIOR\s+([\d,]+\.\d{2})', ocr_cover, re.IGNORECASE)
                if m:
                    summary["initial_balance"] = float(m.group(1).replace(',', ''))
            if 'final_balance' not in found_summary:
                m = re.search(r'SALDO\s+ACTUAL\s+([\d,]+\.\d{2})', ocr_cover, re.IGNORECASE)
                if m:
                    summary["final_balance"] = float(m.group(1).replace(',', ''))

            # OCR de todas las páginas de movimientos
            all_ocr = ""
            in_movements = False
            for page_idx, page in enumerate(doc):
                page_ocr = _ocr_page_text(page)
                if not in_movements:
                    if 'DETALLE DE MOVIMIENTOS' in page_ocr.upper():
                        in_movements = True
                    # También arrancar si encontramos transacciones directamente
                    if re.search(r'^(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\.',
                                 page_ocr, re.MULTILINE | re.IGNORECASE):
                        in_movements = True
                if in_movements:
                    all_ocr += page_ocr + "\n"
                    if 'SI DESEA RECIBIR PAGOS' in page_ocr.upper():
                        break

            sys.stderr.write(f"[INBURSA-OCR] texto OCR total: {len(all_ocr)} chars\n")
            transacciones = _parse_ocr_transactions(all_ocr, year_str, meses_str, summary.get("initial_balance"))
            sys.stderr.write(f"[INBURSA-OCR] transacciones extraídas: {len(transacciones)}\n")

        else:
            # ─── EXTRACCIÓN NORMAL (texto legible) ───────────────────
            all_pages_words = [_fitz_words(doc[i]) for i in range(len(doc))]
            col_positions = _detect_col_positions(all_pages_words)

            if not col_positions:
                sys.stderr.write("[INBURSA-DEBUG] col_positions no detectado — usando fallback\n")
                col_positions = {'cargo': 440.0, 'abono': 510.0, 'saldo': 570.0}
            else:
                sys.stderr.write(f"[INBURSA-DEBUG] col_positions={col_positions}\n")

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

                for line_words in lines:
                    text_upper = " ".join(w['text'].upper() for w in line_words)

                    if "DETALLE DE MOVIMIENTOS" in text_upper and state != "FINISHED":
                        state = "EXTRACTING"

                    if ("FECHA" in text_upper and "CONCEPTO" in text_upper
                            and "SALDO" in text_upper):
                        start_y = line_words[0]['bottom'] + 1

                    if "SI DESEA RECIBIR PAGOS" in text_upper and state == "EXTRACTING":
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

                    if not date_match and _is_spei_detail_line(text_upper):
                        continue

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
