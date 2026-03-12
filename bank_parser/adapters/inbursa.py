import re
import sys
import os
import subprocess
import tempfile


def _group_lines(words, y_tolerance=12):
    """
    Agrupa palabras en líneas visuales por proximidad en Y.
    y_tolerance=12 porque los PDFs Inbursa separan el mes (NOV.) del día (03)
    en ~11px de diferencia vertical dentro de la misma fila de tabla.
    Compara contra el Y de la PRIMERA palabra del grupo (no la última)
    para evitar el efecto cascada al acumular diferencias pequeñas.
    """
    if not words:
        return []
    words_sorted = sorted(words, key=lambda w: (round(w['top'] / y_tolerance), w['x0']))
    lines = []
    current_line = [words_sorted[0]]
    current_min_y = words_sorted[0]['top']
    for w in words_sorted[1:]:
        if abs(w['top'] - current_min_y) <= y_tolerance:
            current_line.append(w)
        else:
            lines.append(sorted(current_line, key=lambda x: x['x0']))
            current_line = [w]
            current_min_y = w['top']
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
                    if t in ('REFERENCIA', 'DESCRIPCION', 'REF.'):
                        # Concepto empieza justo después de REFERENCIA (x1 de REFERENCIA)
                        cols['concepto_x0'] = w['x1'] + 1
                    elif t == 'CONCEPTO':
                        # Fallback: si no hay REFERENCIA, usar x0 de CONCEPTO
                        if 'concepto_x0' not in cols:
                            cols['concepto_x0'] = w['x0']
                    elif t == 'CARGOS':
                        cols['cargo']      = w['x1']   # borde derecho CARGOS
                        cols['cargo_x0']   = w['x0']   # borde izquierdo CARGOS
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
    Detecta si el PDF de Inbursa tiene texto ilegible (realmente ofuscado).
    NO se basa en el nombre del font (AllAndNone puede estar presente incluso
    cuando el texto es legible en versiones más recientes de Inbursa).
    En cambio, verifica si fitz extrae texto coherente: dígitos, meses en español,
    palabras bancarias comunes. Si puede, el PDF es legible → no necesita OCR.
    """
    try:
        MESES = {'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
                 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'}
        PALABRAS_BANCO = {'SPEI', 'DEPOSITO', 'CARGO', 'ABONO', 'SALDO',
                          'TRANSFERENCIA', 'DOMICILIADO', 'RETIRO', 'FECHA'}

        # Revisar las primeras 3 páginas de movimientos
        pages_to_check = range(min(3, len(doc)))
        total_text = ""
        for i in pages_to_check:
            total_text += doc[i].get_text() or ""

        if not total_text.strip():
            sys.stderr.write("[INBURSA] sin texto extraíble → usando OCR\n")
            return True

        words_upper = set(re.findall(r'[A-ZÁÉÍÓÚÑÜ]{3,}', total_text.upper()))

        # Si encontramos meses o palabras bancarias, el texto es legible
        if words_upper & MESES:
            sys.stderr.write(f"[INBURSA] texto legible (meses encontrados) → path normal\n")
            return False
        if words_upper & PALABRAS_BANCO:
            sys.stderr.write(f"[INBURSA] texto legible (palabras bancarias) → path normal\n")
            return False

        # Si hay muchos caracteres del área privada Unicode → realmente ofuscado
        private_use = sum(1 for c in total_text if ord(c) > 0xE000)
        ratio = private_use / max(len(total_text), 1)
        sys.stderr.write(f"[INBURSA] sin palabras reconocibles, private_use ratio={ratio:.4f}\n")
        if ratio > 0.05:
            sys.stderr.write("[INBURSA] PDF realmente ofuscado → usando OCR\n")
            return True

    except Exception as e:
        sys.stderr.write(f"[INBURSA] error en detección: {e}\n")

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

        # Buscar año en las primeras 5 páginas (carátula puede estar en pág 2+)
        year_match = re.search(r'(?:PERIODO|Del)\s+.*?(\d{4})', first_page_text)
        if year_match:
            year_str = year_match.group(1)
        else:
            for pi in range(1, min(5, len(doc))):
                pg_txt = doc[pi].get_text() or ""
                ym = re.search(r'(?:PERIODO|Del)\s+.*?(\d{4})', pg_txt)
                if ym:
                    year_str = ym.group(1)
                    break
            else:
                # Último recurso: buscar año 4 dígitos en rango 2020-2030 en el texto (sin límites de palabra)
                all_years = re.findall(r'(202[0-9]|2030)', first_page_text)
                if all_years:
                    from collections import Counter
                    year_str = Counter(all_years).most_common(1)[0][0]

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
            # Estrategia: cada fila empieza en el día (ancla agrupada con mes)
            all_pages_words = [_fitz_words(doc[i]) for i in range(len(doc))]
            col_positions = _detect_col_positions(all_pages_words)

            # Coordenadas exactas de columnas medidos del PDF Inbursa Nov/Dic 2025
            # FECHA:13-46  REF:47-105  CONCEPTO:106-350  CARGOS:351-420  ABONOS:421-485  SALDO:486-570
            # IMPORTANTE: _detect_col_positions devuelve x1 de la *palabra* del header, NO el borde
            # derecho de la columna. Los montos están right-aligned, así que el borde derecho real
            # es donde terminan los montos (≈420, 485, 570). Usar siempre los valores medidos
            # para cargo/abono/saldo para evitar clasificar abonos como cargos.
            HARDCODED = {
                'cargo': 420.0, 'abono': 485.0, 'saldo': 570.0, 'cargo_x0': 351.0,
            }
            if not col_positions:
                sys.stderr.write("[INBURSA-DEBUG] header no detectado — usando coordenadas hardcoded\n")
                col_positions = dict(HARDCODED)
                col_positions['concepto_x0'] = 106.0
            else:
                # Conservar concepto_x0 del header (puede variar), pero SOBRESCRIBIR
                # cargo/abono/saldo con valores medidos (x1 de palabra != borde de columna)
                col_positions.update(HARDCODED)
                if 'concepto_x0' not in col_positions:
                    col_positions['concepto_x0'] = 106.0
                sys.stderr.write(f"[INBURSA-DEBUG] col: cargo={col_positions['cargo']:.1f} abono={col_positions['abono']:.1f} saldo={col_positions['saldo']:.1f} concepto=[{col_positions.get('concepto_x0',0):.0f},{col_positions.get('cargo_x0',0):.0f}]\n")

            cargo_x      = col_positions['cargo']
            abono_x      = col_positions['abono']
            saldo_x      = col_positions['saldo']
            concepto_x0  = col_positions['concepto_x0']
            concepto_x1  = col_positions['cargo_x0']
            mid_ca       = (cargo_x + abono_x) / 2   # frontera cargo/abono
            mid_as       = (abono_x + saldo_x) / 2   # frontera abono/saldo

            MESES_SET = set(meses_str.keys())
            in_extraction = False
            stop_found    = False

            for page_idx, page in enumerate(doc):
                if stop_found:
                    break

                words = all_pages_words[page_idx]
                if not words:
                    continue

                # ── 1. Límites del área de movimientos en esta página ──
                page_start_y = 0
                page_end_y   = page.rect.height
                lines_4 = _group_lines(words, y_tolerance=4)

                for lw in lines_4:
                    tu = " ".join(w['text'].upper() for w in lw)
                    if (("FECHA" in tu and "CARGOS" in tu and "SALDO" in tu)
                            or "DETALLE DE MOVIMIENTOS" in tu):
                        page_start_y = lw[0]['bottom'] + 1
                        in_extraction = True
                    if ("SI DESEA RECIBIR PAGOS" in tu or "CLIENTE INBURSA:" in tu or "PÁGINA:" in tu) and in_extraction:
                        page_end_y = lw[0]['top'] - 2
                        stop_found = True
                        break

                if not in_extraction:
                    continue

                active = [w for w in words
                          if page_start_y <= w['top'] <= page_end_y]

                # ── 2. Anclas de fila: grupos de palabras en columna de fecha (x0 < 50) ──
                date_words = [w for w in active if w['x0'] < 50]
                # Agrupar día y mes que suelen estar en líneas contiguas (~11px)
                date_groups = _group_lines(date_words, y_tolerance=12)

                anchors = []
                for group in date_groups:
                    # El ancla es la palabra más alta del grupo para marcar el inicio real de la fila
                    anchor_w = min(group, key=lambda x: x['top'])
                    # Verificar que el grupo contenga algo que parezca un mes
                    has_month = False
                    for w in group:
                        t = w['text'].upper().rstrip('.')
                        if t in MESES_SET:
                            has_month = True
                            break
                    if has_month:
                        anchors.append({
                            'top': anchor_w['top'],
                            'words': group
                        })

                if not anchors:
                    continue

                # ── 3. Para cada fila [anchor.top, next_anchor.top) ────
                for i, anchor_data in enumerate(anchors):
                    row_top = anchor_data['top']
                    row_bot = (anchors[i + 1]['top'] - 1
                               if i + 1 < len(anchors)
                               else page_end_y)

                    row_words = [w for w in active
                                 if row_top <= w['top'] < row_bot]

                    # Fecha: Extraer día y mes del grupo de palabras del ancla
                    month_str = "ENE"
                    day = 1
                    for w in anchor_data['words']:
                        t = w['text'].upper().rstrip('.')
                        if t in MESES_SET:
                            month_str = t
                        elif re.match(r'^\d{1,2}$', t) and 1 <= int(t) <= 31:
                            day = int(t)

                    mes   = meses_str.get(month_str, "01")
                    fecha = f"{year_str}-{mes}-{day:02d}"

                    # Referencia
                    ref = ""
                    for w in sorted(row_words, key=lambda x: x['top']):
                        # El usuario dice REF: 47-105. Usamos un margen algo mayor (35-110)
                        if 35 <= w['x0'] <= 110 and re.match(r'^\d{6,}$', w['text']):
                            ref = w['text']
                            break

                    # Cargo / abono / saldo
                    cargo     = 0.0
                    abono     = 0.0
                    saldo_val = None
                    for w in row_words:
                        if _is_money(w['text']):
                            val = float(re.sub(r'[\s,\u202f\xa0]', '', w['text']))
                            x1  = w['x1']
                            # Rangos explicitos segun medicion (el monto termina en x1)
                            if x1 > 500:
                                saldo_val = val
                            elif 421 <= x1 <= 500:
                                abono = val
                            elif 351 <= x1 <= 420:
                                cargo = val
                            else:
                                # Fallback por si la detección geométrica movió algo
                                if x1 > mid_as: saldo_val = val
                                elif x1 > mid_ca: abono = val
                                else: cargo = val

                    if saldo_val is None:
                        continue  # fila sin saldo → no es movimiento

                    # Concepto: entre borde derecho de REFERENCIA y borde izquierdo de CARGOS
                    cw_list = []
                    for w in row_words:
                        if (w['x0'] >= concepto_x0 and w['x0'] < concepto_x1
                                and not _is_money(w['text'])
                                and not _is_spei_detail_line(w['text'].upper())):
                            cw_list.append((w['top'], w['x0'], w['text']))

                    cw_list.sort(key=lambda x: (round(x[0] / 4), x[1]))
                    sub_lines = []
                    cur_sl, last_y_sl = [], None
                    for cy, cx, ct in cw_list:
                        if last_y_sl is None or abs(cy - last_y_sl) <= 4:
                            cur_sl.append(ct)
                        else:
                            sub_lines.append(" ".join(cur_sl))
                            cur_sl = [ct]
                        last_y_sl = cy
                    if cur_sl:
                        sub_lines.append(" ".join(cur_sl))
                    concepto = " ".join(sub_lines).strip()

                    if not concepto and cargo == 0.0 and abono == 0.0:
                        continue

                    transacciones.append({
                        "banco":      "INBURSA",
                        "fecha":      fecha,
                        "concepto":   concepto,
                        "referencia": ref,
                        "cargo":      round(cargo, 2),
                        "abono":      round(abono, 2),
                        "saldo":      round(saldo_val, 2),
                    })

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
