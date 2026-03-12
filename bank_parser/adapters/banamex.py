import re
import sys
import os
import subprocess
import tempfile
import unicodedata


# ──────────────────────────────────────────────────────────────
# UTILIDADES GENERALES
# ──────────────────────────────────────────────────────────────

def _strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def _fitz_words(page):
    raw = page.get_text("words")
    return [
        {'x0': w[0], 'top': w[1], 'x1': w[2], 'bottom': w[3], 'text': w[4]}
        for w in raw if w[4].strip()
    ]


def _group_lines(words, y_tolerance=4):
    if not words:
        return []
    words_sorted = sorted(words, key=lambda w: (round(w['top'] / y_tolerance), w['x0']))
    lines, current_line = [], [words_sorted[0]]
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


# ──────────────────────────────────────────────────────────────
# CARÁTULA: EXTRACCIÓN DE RESUMEN
# ──────────────────────────────────────────────────────────────

def _caratula_from_fitz_words(words, meses_str):
    """
    Extrae saldo anterior, saldo final, periodo y número de cuenta
    de los primeros words de carátula de Banamex via fitz.

    Formato carátula Banamex:
      SALDO ANTERIOR  62,812.95
      SALDO AL 28 DE FEBRERO DE 2026   628,011.78
      CLIENTE: 68433998
    """
    lines = _group_lines(words, y_tolerance=4)
    result = {}

    def _first_money(line_words):
        for w in line_words:
            clean = re.sub(r'[\s,$]', '', w['text'])
            if re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2}$', clean):
                return float(clean.replace(',', ''))
        return None

    for line_words in lines:
        if not line_words:
            continue
        line_txt = " ".join(w['text'] for w in line_words)
        line_upper = line_txt.upper()

        if 'initial_balance' not in result and 'SALDO ANTERIOR' in line_upper:
            val = _first_money(line_words)
            if val is not None:
                result['initial_balance'] = val

        if 'final_balance' not in result and re.search(r'SALDO\s+AL\s+\d', line_upper):
            val = _first_money(line_words)
            if val is not None:
                result['final_balance'] = val

        if 'account_number' not in result:
            m = re.search(r'CLIENTE[:\s]+(\d+)', line_upper)
            if m:
                result['account_number'] = m.group(1)

        if 'period' not in result:
            m = re.search(r'AL\s+(\d{2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})', line_upper)
            if m:
                result['year_str'] = m.group(3)
                result['period'] = f"{m.group(2)[:3]}-{m.group(3)}"

    return result


def _caratula_from_ocr_text(ocr_text):
    result = {}
    m = re.search(r'SALDO\s+ANTERIOR[\s:$]+([\d,]+\.\d{2})', ocr_text, re.IGNORECASE)
    if m:
        result['initial_balance'] = float(m.group(1).replace(',', ''))
    m = re.search(r'SALDO\s+AL\s+\d+\s+DE\s+\w+\s+DE\s+\d+\s+([\d,]+\.\d{2})', ocr_text, re.IGNORECASE)
    if not m:
        m = re.search(r'SALDO\s+AL\b.{0,40}?([\d,]+\.\d{2})', ocr_text, re.IGNORECASE)
    if m:
        result['final_balance'] = float(m.group(1).replace(',', ''))
    m = re.search(r'CLIENTE[:\s]+(\d+)', ocr_text, re.IGNORECASE)
    if m:
        result['account_number'] = m.group(1)
    m = re.search(r'AL\s+(\d{2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})', ocr_text, re.IGNORECASE)
    if m:
        result['year_str'] = m.group(3)
        result['period'] = f"{m.group(2).upper()[:3]}-{m.group(3)}"
    return result


def _ocr_page_text(page, dpi=150):
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
        sys.stderr.write("[BANAMEX-OCR] tesseract no encontrado\n")
        return ''
    except Exception as e:
        sys.stderr.write(f"[BANAMEX-OCR] error: {e}\n")
        return ''


def _extract_caratula(doc, meses_str):
    """
    Extrae metadatos de carátula Banamex (páginas 0-1).
    Intenta fitz primero; OCR como fallback si faltan cifras clave.
    """
    REQUIRED = {'initial_balance', 'final_balance'}
    summary = {
        "initial_balance": None,
        "final_balance": None,
        "account_number": "PREDETERMINADA",
        "period": "",
        "year_str": "2026",
    }

    pages_to_search = range(min(2, len(doc)))

    # ── Fitz pass ─────────────────────────────────────────────
    full_text = ""
    for pi in pages_to_search:
        page_text = doc[pi].get_text() or ""
        full_text += page_text

        # Año desde texto
        if summary["year_str"] == "2026":
            ym = re.search(r'DE\s+(\d{4})', page_text)
            if ym:
                summary["year_str"] = ym.group(1)

        # Número de cuenta / periodo
        if summary["account_number"] == "PREDETERMINADA":
            m = re.search(r'CLIENTE[:\s]+(\d+)', page_text, re.IGNORECASE)
            if m:
                summary["account_number"] = m.group(1)

        if not summary["period"]:
            m = re.search(r'AL\s+(\d{2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})', page_text, re.IGNORECASE)
            if m:
                summary["period"] = f"{m.group(2).upper()[:3]}-{m.group(3)}"
                summary["year_str"] = m.group(3)

        words = _fitz_words(doc[pi])
        found = _caratula_from_fitz_words(words, meses_str)
        for k, v in found.items():
            if summary.get(k) is None or summary.get(k) == "PREDETERMINADA" or summary.get(k) == "":
                summary[k] = v

        if all(summary.get(k) is not None for k in REQUIRED):
            break

    # Fallback año desde texto general
    if summary["year_str"] == "2026":
        all_years = re.findall(r'(202[0-9]|2030)', full_text)
        if all_years:
            from collections import Counter
            summary["year_str"] = Counter(all_years).most_common(1)[0][0]

    # ── OCR fallback ───────────────────────────────────────────
    missing = [k for k in REQUIRED if summary.get(k) is None]
    if missing:
        sys.stderr.write(f"[BANAMEX-CARATULA] fitz no encontró: {missing} — intentando OCR\n")
        ocr_all = ""
        for pi in pages_to_search:
            ocr_all += _ocr_page_text(doc[pi]) + "\n"
        found_ocr = _caratula_from_ocr_text(ocr_all)
        for k in missing:
            if k in found_ocr:
                summary[k] = found_ocr[k]

    sys.stderr.write(
        f"[BANAMEX-CARATULA] SA={summary['initial_balance']} "
        f"SF={summary['final_balance']} "
        f"año={summary['year_str']} cuenta={summary['account_number']} "
        f"periodo={summary['period']}\n"
    )
    return summary


# ──────────────────────────────────────────────────────────────
# VALIDACIÓN
# ──────────────────────────────────────────────────────────────

def _validate_movements(transactions, caratula, tolerance=1.0):
    """
    Valida SA + Σabonos - Σcargos == SF_carátula.
    Idéntica lógica al parser Inbursa para consistencia.
    """
    saldo_anterior = caratula.get('initial_balance')
    saldo_actual   = caratula.get('final_balance')
    has_sa_sf = saldo_anterior is not None and saldo_actual is not None

    computed_cargos = round(sum(t.get('cargo', 0.0) for t in transactions), 2)
    computed_abonos = round(sum(t.get('abono', 0.0) for t in transactions), 2)
    computed_sf     = transactions[-1].get('saldo') if transactions else None

    issues = []

    if not transactions:
        sys.stderr.write("[BANAMEX-VALID] ✗ 0 movimientos extraídos\n")
        return {
            'is_valid': False, 'has_caratula': has_sa_sf,
            'issues': ['sin_movimientos'],
            'n_movements': 0,
            'computed_cargos': 0.0, 'computed_abonos': 0.0,
            'computed_saldo_final': None,
            'caratula_saldo_anterior': saldo_anterior,
            'caratula_saldo_actual': saldo_actual,
        }

    if has_sa_sf:
        expected_sf = round(saldo_anterior + computed_abonos - computed_cargos, 2)
        diff = abs(expected_sf - saldo_actual)
        if diff > tolerance:
            issues.append(
                f'aritmetica_movimientos: SA({saldo_anterior:.2f}) + AB_mov({computed_abonos:.2f}) '
                f'- CA_mov({computed_cargos:.2f}) = {expected_sf:.2f} ≠ SF_caratula({saldo_actual:.2f}) '
                f'diff={diff:.2f}'
            )

    if saldo_actual is not None and computed_sf is not None:
        diff = abs(computed_sf - saldo_actual)
        if diff > tolerance:
            issues.append(
                f'saldo_final: SF_caratula={saldo_actual:.2f} ultimo_mov={computed_sf:.2f} diff={diff:.2f}'
            )

    result = {
        'is_valid': len(issues) == 0,
        'has_caratula': has_sa_sf,
        'issues': issues,
        'n_movements': len(transactions),
        'computed_cargos': computed_cargos,
        'computed_abonos': computed_abonos,
        'computed_saldo_final': computed_sf,
        'caratula_saldo_anterior': saldo_anterior,
        'caratula_saldo_actual': saldo_actual,
    }

    if result['is_valid']:
        sys.stderr.write(
            f"[BANAMEX-VALID] ✓ OK — {len(transactions)} movs "
            f"SA({saldo_anterior}) + AB({computed_abonos:.2f}) - CA({computed_cargos:.2f}) "
            f"= SF({saldo_actual}) ✓\n"
        )
    else:
        sys.stderr.write(f"[BANAMEX-VALID] ✗ FALLÓ ({len(issues)} issues):\n")
        for issue in issues:
            sys.stderr.write(f"  - {issue}\n")

    return result


# ──────────────────────────────────────────────────────────────
# EXTRACCIÓN FITZ
# ──────────────────────────────────────────────────────────────

# Regex para filtrar líneas de referencia de pie de página
_PAGE_REF_RE = re.compile(r"^\d{6,}\.[A-Z0-9]+\.", re.I)

_STOP_KEYWORDS = [
    "BANCA ELECTRÓNICA", "BANCA ELECTRONICA",
    "SALDO PROMEDIO MINIMO", "COMISIONES COBRADAS", "TOTAL DE OPERACIONES",
]


def _detect_col_positions_banamex(lines):
    """Detecta centros de columna RETIROS/DEPOSITOS/SALDO del encabezado."""
    for line_words in lines:
        text_norm = _strip_accents(" ".join(w['text'].upper() for w in line_words))
        if "RETIROS" in text_norm and "DEPOSITOS" in text_norm and "SALDO" in text_norm:
            cols = {}
            for w in line_words:
                wt = _strip_accents(w['text'].upper())
                if wt in ("RETIROS", "DEPOSITOS", "SALDO"):
                    cols[wt] = (w['x0'] + w['x1']) / 2
            if cols:
                return cols
    return {}


def _assign_amount(val, w_center, col_centers):
    """Asigna un valor a RETIROS/DEPOSITOS/SALDO según posición X."""
    if col_centers:
        cols_sorted = sorted(col_centers.items(), key=lambda x: x[1])
        boundaries = [(cols_sorted[i][1] + cols_sorted[i+1][1]) / 2
                      for i in range(len(cols_sorted) - 1)]
        seg = sum(1 for b in boundaries if w_center >= b)
        assigned = cols_sorted[seg][0]
    else:
        # Hardcoded para Banamex (x1 aproximado)
        if w_center < 290:
            assigned = "RETIROS"
        elif w_center < 400:
            assigned = "DEPOSITOS"
        else:
            assigned = "SALDO"
    return assigned


def _extract_fitz_transactions(doc, year_str, meses_str):
    """
    Extrae movimientos de un PDF Banamex legible usando coordenadas fitz.
    """
    MESES_SET = set(meses_str.keys())
    in_details = False
    stop_all = False
    transacciones = []
    col_centers = {}
    current_tx = None
    summary_initial = None

    for page in doc:
        if stop_all:
            break

        words = _fitz_words(page)
        if not words:
            continue

        lines = _group_lines(words, y_tolerance=4)

        # Detectar posiciones de columna en esta página si aún no tenemos
        if not col_centers:
            detected = _detect_col_positions_banamex(lines)
            if detected:
                col_centers = detected
                sys.stderr.write(
                    f"[BANAMEX-FITZ] cols: RETIROS={col_centers.get('RETIROS', 0):.1f} "
                    f"DEPOSITOS={col_centers.get('DEPOSITOS', 0):.1f} "
                    f"SALDO={col_centers.get('SALDO', 0):.1f}\n"
                )

        for line_words in lines:
            text_line  = " ".join(w['text'] for w in line_words)
            text_upper = text_line.upper()

            # Encabezado sección movimientos
            if "DETALLE DE OPERACIONES" in text_upper:
                in_details = True
                continue

            if not in_details:
                continue

            # Stop keywords
            if any(kw in text_upper for kw in _STOP_KEYWORDS):
                stop_all = True
                break

            # Actualizar col_centers en cada página nueva
            detected = _detect_col_positions_banamex([line_words])
            if detected:
                col_centers = detected

            # Saltar "SALDO ANTERIOR" de la tabla (extractar saldo si no lo tenemos)
            if "SALDO ANTERIOR" in text_upper:
                if summary_initial is None:
                    for w in line_words:
                        if re.match(r'^[\d,]+\.\d{2}$', w['text']):
                            try:
                                summary_initial = float(w['text'].replace(',', ''))
                            except Exception:
                                pass
                continue

            # Filtrar líneas de referencia de pie de página
            if len(line_words) <= 2 and _PAGE_REF_RE.match(text_line.strip()):
                continue

            # Estructura: "SALDO AL DD MMM" → no es transacción
            _is_balance_row = "SALDO ANTERIOR" in text_upper or bool(re.search(r'SALDO\s+AL\s+\d{2}', text_upper))

            # Detectar nueva transacción por fecha (DD MMM al inicio)
            date_match = None
            if line_words[0]['x0'] < 80 and len(line_words) >= 2:
                match_str = f"{line_words[0]['text']} {line_words[1]['text']}"
                date_match = re.match(r'^(\d{2})\s+([A-Z]{3})$', match_str.strip().upper())

            if date_match and not _is_balance_row:
                if current_tx:
                    # Artifact Banamex: si cargo == abono > 0 → solo abono
                    if current_tx["cargo"] > 0 and current_tx["cargo"] == current_tx["abono"]:
                        current_tx["cargo"] = 0.0
                    transacciones.append(current_tx)
                dia = date_match.group(1)
                mes = meses_str.get(date_match.group(2), "01")
                current_tx = {
                    "banco": "BANAMEX",
                    "fecha": f"{year_str}-{mes}-{dia}",
                    "concepto": "",
                    "referencia": "",
                    "cargo": 0.0, "abono": 0.0, "saldo": 0.0
                }

            if current_tx is None:
                continue

            desc_parts = []
            for i, w in enumerate(line_words):
                tw = w['text']
                if date_match and i < 2 and w['x0'] < 80:
                    continue
                if re.match(r'^-?[\d,]+\.\d{2}$', tw):
                    val = float(tw.replace(',', ''))
                    w_center = (w['x0'] + w['x1']) / 2
                    assigned = _assign_amount(val, w_center, col_centers)
                    if assigned == "RETIROS":
                        current_tx["cargo"] = val
                    elif assigned == "DEPOSITOS":
                        current_tx["abono"] = val
                    elif assigned == "SALDO":
                        current_tx["saldo"] = val
                else:
                    desc_parts.append(tw)

            inc_desc = " ".join(desc_parts).strip()
            if inc_desc:
                current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()

            # Extraer referencia del concepto acumulado
            ref_match = re.search(
                r'(?:REF\.?|RASTREO:?)\s*([A-Z0-9]{6,})',
                current_tx["concepto"].upper()
            )
            if ref_match:
                current_tx["referencia"] = ref_match.group(1)

    if current_tx:
        if current_tx["cargo"] > 0 and current_tx["cargo"] == current_tx["abono"]:
            current_tx["cargo"] = 0.0
        transacciones.append(current_tx)

    sys.stderr.write(f"[BANAMEX-FITZ] transacciones extraídas: {len(transacciones)}\n")
    return transacciones, summary_initial


# ──────────────────────────────────────────────────────────────
# EXTRACCIÓN OCR
# ──────────────────────────────────────────────────────────────

def _parse_ocr_transactions(all_ocr_text, year_str, meses_str):
    """
    Parsea texto OCR de Banamex. Estrategia:
    - Detecta fechas "DD MMM" al inicio de línea
    - Asigna montos a cargo/abono/saldo por posición relativa (3er, 4to, 5to valor)
    - Infiere cargo/abono desde diferencia de saldos
    """
    MONEY_PAT = re.compile(r'(\d{1,3}(?:,\d{3})*\.\d{2})')
    DATE_PAT  = re.compile(r'^(\d{2})\s+([A-Z]{3})\s+', re.IGNORECASE)

    def _to_float(s):
        return float(s.replace(',', ''))

    def _finalize(tx, prev_sal):
        if tx is None:
            return prev_sal
        sal = tx['saldo']
        if prev_sal is None:
            return sal
        diff = round(sal - prev_sal, 2)
        if diff >= 0:
            tx['abono'] = round(diff, 2)
            tx['cargo'] = 0.0
        else:
            tx['cargo'] = round(-diff, 2)
            tx['abono'] = 0.0
        return sal

    transactions = []
    current_tx  = None
    prev_saldo  = None

    for raw_line in all_ocr_text.split('\n'):
        line = raw_line.strip()
        if not line:
            continue
        if any(kw in line.upper() for kw in _STOP_KEYWORDS):
            break
        if 'SALDO ANTERIOR' in line.upper():
            amounts = MONEY_PAT.findall(line)
            if amounts and prev_saldo is None:
                prev_saldo = _to_float(amounts[-1])
            continue

        m = DATE_PAT.match(line.upper())
        if m:
            if current_tx:
                prev_saldo = _finalize(current_tx, prev_saldo)
                transactions.append(current_tx)
            dia = m.group(1)
            mes = meses_str.get(m.group(2)[:3].upper(), "01")
            rest = line[m.end():]
            amounts = MONEY_PAT.findall(rest)
            saldo = _to_float(amounts[-1]) if amounts else 0.0
            concepto = MONEY_PAT.sub('', rest).strip()
            current_tx = {
                'banco': 'BANAMEX',
                'fecha': f'{year_str}-{mes}-{dia}',
                'concepto': concepto,
                'referencia': '',
                'cargo': 0.0, 'abono': 0.0, 'saldo': saldo
            }
        elif current_tx:
            line_clean = line.strip()
            if line_clean and not MONEY_PAT.search(line_clean) and len(line_clean) < 120:
                current_tx['concepto'] = (current_tx['concepto'] + ' ' + line_clean).strip()

    if current_tx:
        prev_saldo = _finalize(current_tx, prev_saldo)
        transactions.append(current_tx)

    return transactions


def _extract_ocr_transactions(doc, year_str, meses_str):
    """
    Extrae movimientos usando OCR de páginas de Banamex.
    """
    all_ocr = ""
    in_movements = False
    for page in doc:
        page_ocr = _ocr_page_text(page)
        if not in_movements:
            if 'DETALLE DE OPERACIONES' in page_ocr.upper():
                in_movements = True
        if in_movements:
            all_ocr += page_ocr + "\n"
            if any(kw in page_ocr.upper() for kw in _STOP_KEYWORDS):
                break

    sys.stderr.write(f"[BANAMEX-OCR] texto total: {len(all_ocr)} chars\n")
    txs = _parse_ocr_transactions(all_ocr, year_str, meses_str)
    sys.stderr.write(f"[BANAMEX-OCR] transacciones: {len(txs)}\n")
    return txs


# ──────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA PRINCIPAL
# ──────────────────────────────────────────────────────────────

def extract_banamex(pdf_path):
    """
    Extrae movimientos de un estado de cuenta Banamex.

    Estrategia dual-path (idéntica a Inbursa):
      1. Extrae carátula (SA, SF) de páginas 0-1
      2. Intenta extracción fitz
      3. Valida: SA + Σabonos - Σcargos == SF_carátula
      4. Si fitz valida → usar fitz
      5. Si fitz falla → intentar OCR
      6. Usar el resultado que mejor valide
    """
    meses_str = {
        "ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04",
        "MAY": "05", "JUN": "06", "JUL": "07", "AGO": "08",
        "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"
    }

    summary_base = {
        "initial_balance": None, "final_balance": None,
        "period": "", "account_number": "PREDETERMINADA"
    }

    try:
        import fitz

        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            return {"movements": [], "summary": summary_base, "validation": None}

        # ── 1. CARÁTULA ──────────────────────────────────────
        caratula = _extract_caratula(doc, meses_str)
        year_str = caratula["year_str"]

        summary_base["account_number"] = caratula.get("account_number", "PREDETERMINADA")
        summary_base["period"]          = caratula.get("period", "")
        summary_base["initial_balance"] = caratula.get("initial_balance")
        summary_base["final_balance"]   = caratula.get("final_balance")

        # ── 2. EXTRACCIÓN FITZ ───────────────────────────────
        sys.stderr.write("[BANAMEX] extracción fitz\n")
        fitz_txs, fitz_summary_initial = _extract_fitz_transactions(doc, year_str, meses_str)

        # Rellenar SA desde tabla si carátula no lo tiene
        if caratula.get("initial_balance") is None and fitz_summary_initial is not None:
            caratula["initial_balance"] = fitz_summary_initial
            summary_base["initial_balance"] = fitz_summary_initial

        fitz_val = _validate_movements(fitz_txs, caratula)

        transacciones = fitz_txs
        validation    = fitz_val
        method_used   = "fitz"

        if not fitz_val['is_valid'] and fitz_val['has_caratula']:
            # ── 3. FALLBACK OCR ──────────────────────────────
            sys.stderr.write("[BANAMEX] fitz no validó → intentando OCR\n")
            ocr_txs = _extract_ocr_transactions(doc, year_str, meses_str)
            ocr_val = _validate_movements(ocr_txs, caratula)

            if ocr_val['is_valid']:
                sys.stderr.write("[BANAMEX] OCR validó ✓\n")
                transacciones = ocr_txs
                validation    = ocr_val
                method_used   = "ocr_fallback"
            else:
                # Usar el de menor discrepancia
                def _disc(v):
                    a = v.get('computed_cargos') or 0
                    b = v.get('caratula_saldo_actual') or 0
                    c = v.get('computed_saldo_final') or 0
                    return abs(a - b) + abs(c - b)

                if _disc(fitz_val) <= _disc(ocr_val):
                    method_used = "fitz_unvalidated"
                else:
                    transacciones = ocr_txs
                    validation    = ocr_val
                    method_used   = "ocr_unvalidated"

                sys.stderr.write(
                    f"[BANAMEX] ADVERTENCIA: ninguno validó — usando {method_used}\n"
                )

        doc.close()

        # ── 4. LIMPIAR Y EMITIR ──────────────────────────────
        transacciones = [
            t for t in transacciones
            if t["concepto"] or t["cargo"] > 0 or t["abono"] > 0
        ]

        if validation:
            validation['method_used'] = method_used

        if transacciones:
            summary_base["total_cargos"] = round(sum(t.get("cargo", 0) for t in transacciones), 2)
            summary_base["total_abonos"] = round(sum(t.get("abono", 0) for t in transacciones), 2)
            if summary_base["final_balance"] is None:
                summary_base["final_balance"] = transacciones[-1].get("saldo")
            if summary_base["initial_balance"] is None and transacciones:
                first = transacciones[0]
                summary_base["initial_balance"] = (
                    first.get("saldo", 0) - first.get("abono", 0) + first.get("cargo", 0)
                )

        return {"movements": transacciones, "summary": summary_base, "validation": validation}

    except Exception as e:
        import traceback
        sys.stderr.write(f"Error procesando Banamex: {e}\n{traceback.format_exc()}\n")

        # Fallback: intentar con pdfplumber (parser legacy)
        sys.stderr.write("[BANAMEX] intentando fallback con pdfplumber\n")
        try:
            return _extract_banamex_pdfplumber(pdf_path, summary_base, meses_str)
        except Exception as e2:
            sys.stderr.write(f"[BANAMEX] pdfplumber fallback también falló: {e2}\n")
            return {"movements": [], "summary": summary_base, "validation": None}


def _extract_banamex_pdfplumber(pdf_path, summary_base, meses_str):
    """
    Parser legado con pdfplumber — usado como último fallback.
    """
    import pdfplumber

    transacciones = []
    col_centers   = {}
    PAGE_REF_RE   = re.compile(r"^\d{6,}\.[A-Z0-9]+\.", re.I)

    with pdfplumber.open(pdf_path) as pdf:
        year_str = "2026"
        in_details = False
        current_tx = None
        stop_all = False

        first_text = pdf.pages[0].extract_text() or ""

        ym = re.search(r"AL\s+(\d{2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})", first_text, re.I)
        if ym:
            year_str = ym.group(3)
            summary_base["period"] = f"{ym.group(2)[:3].upper()}-{year_str}"

        acc_m = re.search(r"CLIENTE:\s+(\d+)", first_text, re.I)
        if acc_m:
            summary_base["account_number"] = acc_m.group(1)

        words_p1 = pdf.pages[0].extract_words()
        for i, w in enumerate(words_p1):
            txt = w['text'].upper()
            if "ANTERIOR" in txt:
                for nw in words_p1[i+1:i+15]:
                    if abs(nw['top'] - w['top']) < 10:
                        clean = nw['text'].replace("$","").replace(",","")
                        try:
                            summary_base["initial_balance"] = float(clean)
                            break
                        except Exception:
                            pass
            if txt == "SALDO" and i + 1 < len(words_p1) and words_p1[i+1]['text'].upper() == "AL":
                for nw in words_p1[i+1:i+20]:
                    if abs(nw['top'] - w['top']) < 10 and '.' in nw['text']:
                        clean = nw['text'].replace("$","").replace(",","")
                        try:
                            val = float(clean)
                            if val > 0:
                                summary_base["final_balance"] = val
                                break
                        except Exception:
                            pass

        for page in pdf.pages:
            if stop_all:
                break
            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            if not words:
                continue

            words.sort(key=lambda w: (round(w['top']), w['x0']))
            lines, current_line = [], [words[0]]
            for w in words[1:]:
                if abs(w['top'] - current_line[-1]['top']) <= 4:
                    current_line.append(w)
                else:
                    lines.append(current_line)
                    current_line = [w]
            if current_line:
                lines.append(current_line)

            for line_words in lines:
                text_line  = " ".join(w['text'] for w in line_words)
                text_upper = text_line.upper()

                if "DETALLE DE OPERACIONES" in text_upper:
                    in_details = True
                    continue
                if not in_details:
                    continue
                if any(kw in text_upper for kw in _STOP_KEYWORDS):
                    stop_all = True
                    break

                text_norm = _strip_accents(text_upper)
                if "RETIROS" in text_norm and "DEPOSITOS" in text_norm:
                    col_centers = {}
                    for w in line_words:
                        wt = _strip_accents(w['text'].upper())
                        if wt in ("RETIROS", "DEPOSITOS", "SALDO"):
                            col_centers[wt] = (w['x0'] + w['x1']) / 2
                    continue

                if "SALDO ANTERIOR" in text_upper:
                    if summary_base["initial_balance"] is None:
                        for w in line_words:
                            if re.match(r"^[\d,]+\.\d{2}$", w['text']):
                                try:
                                    summary_base["initial_balance"] = float(w['text'].replace(",",""))
                                except Exception:
                                    pass
                    continue

                if len(line_words) <= 2 and PAGE_REF_RE.match(text_line.strip()):
                    continue

                _is_balance_row = "SALDO ANTERIOR" in text_upper or bool(re.search(r"SALDO\s+AL\s+\d{2}", text_upper))
                date_match = None
                if line_words[0]['x0'] < 80 and len(line_words) >= 2:
                    ms = f"{line_words[0]['text']} {line_words[1]['text']}"
                    date_match = re.match(r'^(\d{2})\s+([A-Z]{3})$', ms.strip().upper())

                if date_match and not _is_balance_row:
                    if current_tx:
                        if current_tx["cargo"] > 0 and current_tx["cargo"] == current_tx["abono"]:
                            current_tx["cargo"] = 0.0
                        transacciones.append(current_tx)
                    dia = date_match.group(1)
                    mes = meses_str.get(date_match.group(2), "01")
                    current_tx = {
                        "banco": "BANAMEX", "fecha": f"{year_str}-{mes}-{dia}",
                        "concepto": "", "referencia": "",
                        "cargo": 0.0, "abono": 0.0, "saldo": 0.0
                    }

                if current_tx is None:
                    continue

                desc_parts = []
                for i, w in enumerate(line_words):
                    tw = w['text']
                    if date_match and i < 2 and w['x0'] < 80:
                        continue
                    if re.match(r"^-?[\d,]+\.\d{2}$", tw):
                        val = float(tw.replace(",",""))
                        w_center = (w['x0'] + w['x1']) / 2
                        assigned = _assign_amount(val, w_center, col_centers)
                        if assigned == "RETIROS":
                            current_tx["cargo"] = val
                        elif assigned == "DEPOSITOS":
                            current_tx["abono"] = val
                        elif assigned == "SALDO":
                            current_tx["saldo"] = val
                    else:
                        desc_parts.append(tw)

                inc_desc = " ".join(desc_parts).strip()
                if inc_desc:
                    current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()

                ref_m = re.search(r'(?:REF\.?|RASTREO:?)\s*([A-Z0-9]{6,})', current_tx["concepto"].upper())
                if ref_m:
                    current_tx["referencia"] = ref_m.group(1)

        if current_tx:
            if current_tx["cargo"] > 0 and current_tx["cargo"] == current_tx["abono"]:
                current_tx["cargo"] = 0.0
            transacciones.append(current_tx)

    return {"movements": transacciones, "summary": summary_base, "validation": None}
