import re
import sys
import os
import subprocess
import tempfile


# ──────────────────────────────────────────────────────────────
# UTILIDADES GENERALES
# ──────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────
# CARÁTULA: EXTRACCIÓN DE RESUMEN
# ──────────────────────────────────────────────────────────────

def _caratula_from_fitz_words(words):
    """
    Extrae SALDO ANTERIOR, SALDO ACTUAL, ABONOS, CARGOS de una lista de palabras fitz.
    Retorna dict con las claves encontradas (pueden ser None si no se hallaron).

    Formato carátula Inbursa:
      SALDO ANTERIOR  100,626.95  DIAS DEL PERIODO 30 GAT NOMINAL 5.15%
      ABONOS          162,351.54  TASA BRUTA 7.17%  RENDIMIENTOS 791.65
      CARGOS          171,334.16  TASA NETA  7.17%
      SALDO ACTUAL     91,644.33  I.S.R. 0%

    El valor del resumen es SIEMPRE el primer número en la línea (left-to-right),
    ya que a la derecha aparecen tasas, comisiones y otros valores menores.

    Para ABONOS/CARGOS solo aplica cuando el label está al inicio de la línea
    (x0 < 60) para no confundir con el header de la tabla de movimientos.
    """
    lines = _group_lines(words)
    result = {}

    def _first_money(line_words):
        """Primer valor monetario de la línea (busca de izquierda a derecha)."""
        for w in line_words:
            clean = re.sub(r'[\s,\u202f\xa0$]', '', w['text'])
            if re.match(r'^-?\d{1,3}(?:\d{3})*\.\d{2}$', clean):
                return float(clean)
        return None

    for line_words in lines:
        if not line_words:
            continue
        line_txt = " ".join(w['text'].upper() for w in line_words)
        first_word_x0 = line_words[0]['x0']

        # SALDO ANTERIOR
        if 'initial_balance' not in result and re.search(r'SALDO\s+ANTERIOR', line_txt):
            val = _first_money(line_words)
            if val is not None:
                result['initial_balance'] = val

        # SALDO ACTUAL
        if 'final_balance' not in result and re.search(r'SALDO\s+ACTUAL', line_txt):
            val = _first_money(line_words)
            if val is not None:
                result['final_balance'] = val

        # ABONOS — solo si aparece al inicio de la línea (no es header de tabla)
        if 'total_abonos' not in result and re.search(r'\bABONOS\b', line_txt):
            if first_word_x0 < 60:  # label al margen izquierdo = fila de resumen
                val = _first_money(line_words)
                if val is not None:
                    result['total_abonos'] = val

        # CARGOS — solo si aparece al inicio de la línea
        if 'total_cargos' not in result and re.search(r'\bCARGOS\b', line_txt):
            if first_word_x0 < 60:
                val = _first_money(line_words)
                if val is not None:
                    result['total_cargos'] = val

    return result


def _caratula_from_ocr_text(ocr_text):
    """
    Extrae SALDO ANTERIOR, SALDO ACTUAL, ABONOS, CARGOS desde texto OCR.
    """
    result = {}
    patterns = {
        'initial_balance': r'SALDO\s+ANTERIOR[\s:$]+([\d,]+\.\d{2})',
        'final_balance':   r'SALDO\s+ACTUAL[\s:$]+([\d,]+\.\d{2})',
        'total_abonos':    r'ABONOS[\s:$]+([\d,]+\.\d{2})',
        'total_cargos':    r'CARGOS[\s:$]+([\d,]+\.\d{2})',
    }
    for key, pat in patterns.items():
        m = re.search(pat, ocr_text, re.IGNORECASE)
        if m:
            result[key] = float(m.group(1).replace(',', ''))
    return result


def _extract_caratula(doc, meses_str):
    """
    Extrae el resumen de carátula buscando en páginas 0-3.
    1. Intenta con fitz en páginas 0-3
    2. Si no encuentra las 4 cifras, hace OCR de las mismas páginas como fallback

    Retorna:
        summary dict: initial_balance, final_balance, total_abonos, total_cargos,
                      account_number, period, year_str
    """
    REQUIRED = {'initial_balance', 'final_balance', 'total_abonos', 'total_cargos'}
    summary = {
        "initial_balance": None,
        "final_balance": None,
        "total_abonos": None,
        "total_cargos": None,
        "account_number": "PREDETERMINADA",
        "period": "",
        "year_str": str(__import__('datetime').date.today().year),
    }

    pages_to_search = range(min(4, len(doc)))

    # ── 1. Fitz pass ─────────────────────────────────────────
    full_text = ""
    for pi in pages_to_search:
        page_text = doc[pi].get_text() or ""
        full_text += page_text

        # Año y período
        if summary["period"] == "":
            pm = re.search(
                r'PERIODO\s+Del\s+([\d\w\s]+?)\s+al\s+([\d\w\s]+?)(?:\n|\r|$)',
                page_text, re.IGNORECASE
            )
            if pm:
                summary["period"] = f"{pm.group(1).strip()} - {pm.group(2).strip()}"

        if summary["year_str"] == str(__import__('datetime').date.today().year):
            ym = re.search(r'(?:PERIODO|Del)\s+.*?(\d{4})', page_text)
            if ym:
                summary["year_str"] = ym.group(1)

        # Número de cuenta
        if summary["account_number"] == "PREDETERMINADA":
            for pat in [
                r'(?:CUENTA|CTA)[:\s]+([\d\-]+)',
                r'CLABE\s+(\d{18})',
                r'Cliente\s+Inbursa[:\s]+(\d+)',
            ]:
                m = re.search(pat, page_text, re.IGNORECASE)
                if m:
                    summary["account_number"] = m.group(1).strip()
                    break

        # Saldos de carátula via fitz words
        words = _fitz_words(doc[pi])
        found = _caratula_from_fitz_words(words)
        for k, v in found.items():
            if summary.get(k) is None:
                summary[k] = v

        # Si ya tenemos las 4 cifras, no seguimos
        if all(summary.get(k) is not None for k in REQUIRED):
            break

    # Fallback año desde texto general
    if summary["year_str"] == str(__import__('datetime').date.today().year):
        all_years = re.findall(r'(202[0-9]|2030)', full_text)
        if all_years:
            from collections import Counter
            summary["year_str"] = Counter(all_years).most_common(1)[0][0]

    # ── 2. OCR fallback si faltan cifras ─────────────────────
    missing = [k for k in REQUIRED if summary.get(k) is None]
    if missing:
        sys.stderr.write(f"[INBURSA-CARATULA] fitz no encontró: {missing} — intentando OCR carátula\n")
        ocr_text_all = ""
        for pi in pages_to_search:
            ocr_text_all += _ocr_page_text(doc[pi]) + "\n"
            # Año y período via OCR
            if summary["period"] == "":
                pm = re.search(
                    r'Del\s+([\d\w\s]+?)\s+al\s+([\d\w\s]+?)(?:\n|\r|$)',
                    ocr_text_all, re.IGNORECASE
                )
                if pm:
                    summary["period"] = f"{pm.group(1).strip()} - {pm.group(2).strip()}"
            if summary["account_number"] == "PREDETERMINADA":
                m = re.search(r'Cliente\s+Inbursa[:\s]+(\d+)', ocr_text_all, re.IGNORECASE)
                if m:
                    summary["account_number"] = m.group(1)

        found_ocr = _caratula_from_ocr_text(ocr_text_all)
        for k in missing:
            if k in found_ocr:
                summary[k] = found_ocr[k]
                sys.stderr.write(f"[INBURSA-CARATULA] OCR encontró {k}={found_ocr[k]}\n")

    # Log resultado
    found_keys = [k for k in REQUIRED if summary.get(k) is not None]
    sys.stderr.write(
        f"[INBURSA-CARATULA] SA={summary['initial_balance']} "
        f"AB={summary['total_abonos']} CA={summary['total_cargos']} "
        f"SF={summary['final_balance']} "
        f"año={summary['year_str']} cuenta={summary['account_number']}\n"
    )

    return summary


# ──────────────────────────────────────────────────────────────
# VALIDACIÓN
# ──────────────────────────────────────────────────────────────

def _validate_movements(transactions, caratula, tolerance=1.0):
    """
    Valida que los movimientos extraídos sean completos y correctos.

    Ecuación clave (lo que el usuario quiere verificar):
        SALDO_ANTERIOR + Σabonos_movs - Σcargos_movs == SALDO_ACTUAL (carátula)

    Si esto se cumple, todos los movimientos fueron capturados correctamente.
    Si no, hay movimientos faltantes o con montos incorrectos.

    Checks realizados:
      1. Carátula self-consistent: SA + ABONOS_car - CARGOS_car == SF_car
      2. Aritmética de movimientos: SA + Σabonos - Σcargos == SF_car  ← CHECK PRINCIPAL
      3. Último saldo de movimientos == SF_car  (chequeo secundario de integridad)

    Retorna dict con is_valid, issues, cifras computadas y de carátula.
    """
    saldo_anterior  = caratula.get('initial_balance')
    caratula_cargos = caratula.get('total_cargos')
    caratula_abonos = caratula.get('total_abonos')
    saldo_actual    = caratula.get('final_balance')

    has_caratula = all(v is not None for v in [
        saldo_anterior, caratula_cargos, caratula_abonos, saldo_actual
    ])
    has_sa_sf = saldo_anterior is not None and saldo_actual is not None

    computed_cargos      = round(sum(t.get('cargo', 0.0) for t in transactions), 2)
    computed_abonos      = round(sum(t.get('abono', 0.0) for t in transactions), 2)
    computed_saldo_final = transactions[-1].get('saldo') if transactions else None

    issues = []

    # Sin movimientos: siempre inválido si hay datos de carátula
    if not transactions:
        sys.stderr.write("[INBURSA-VALID] ✗ FALLÓ: 0 movimientos extraídos\n")
        return {
            'is_valid': False,
            'has_caratula': has_caratula,
            'issues': ['sin_movimientos: extracción produjo 0 transacciones'],
            'n_movements': 0,
            'computed_cargos': 0.0,
            'computed_abonos': 0.0,
            'computed_saldo_final': None,
            'caratula_saldo_anterior': saldo_anterior,
            'caratula_cargos': caratula_cargos,
            'caratula_abonos': caratula_abonos,
            'caratula_saldo_actual': saldo_actual,
        }

    # Check 1: carátula self-consistent (SA + ABONOS - CARGOS = SF en el PDF)
    if has_caratula:
        expected = round(saldo_anterior + caratula_abonos - caratula_cargos, 2)
        diff = abs(expected - saldo_actual)
        if diff > tolerance:
            issues.append(
                f'caratula_inconsistente: SA({saldo_anterior:.2f}) + AB({caratula_abonos:.2f}) '
                f'- CA({caratula_cargos:.2f}) = {expected:.2f} ≠ SF({saldo_actual:.2f}) '
                f'diff={diff:.2f}'
            )

    # Check 2: aritmética de movimientos (CHECK PRINCIPAL)
    # SA + Σabonos_extraídos - Σcargos_extraídos debe igual el SF de la carátula
    if has_sa_sf and transactions:
        computed_sf = round(saldo_anterior + computed_abonos - computed_cargos, 2)
        diff = abs(computed_sf - saldo_actual)
        if diff > tolerance:
            issues.append(
                f'aritmetica_movimientos: SA({saldo_anterior:.2f}) + AB_mov({computed_abonos:.2f}) '
                f'- CA_mov({computed_cargos:.2f}) = {computed_sf:.2f} ≠ SF_caratula({saldo_actual:.2f}) '
                f'diff={diff:.2f} — posibles movimientos faltantes o con monto incorrecto'
            )

    # Check 3: último saldo de movimientos == SF carátula
    if saldo_actual is not None and computed_saldo_final is not None:
        diff = abs(computed_saldo_final - saldo_actual)
        if diff > tolerance:
            issues.append(
                f'saldo_final: SF_caratula={saldo_actual:.2f} ultimo_mov={computed_saldo_final:.2f} diff={diff:.2f}'
            )

    result = {
        'is_valid': len(issues) == 0,
        'has_caratula': has_caratula,
        'issues': issues,
        'n_movements': len(transactions),
        'computed_cargos': computed_cargos,
        'computed_abonos': computed_abonos,
        'computed_saldo_final': computed_saldo_final,
        'caratula_saldo_anterior': saldo_anterior,
        'caratula_cargos': caratula_cargos,
        'caratula_abonos': caratula_abonos,
        'caratula_saldo_actual': saldo_actual,
    }

    if result['is_valid']:
        sys.stderr.write(
            f"[INBURSA-VALID] ✓ OK — {len(transactions)} movs "
            f"SA({saldo_anterior}) + AB({computed_abonos:.2f}) - CA({computed_cargos:.2f}) "
            f"= SF({saldo_actual}) ✓\n"
        )
    else:
        sys.stderr.write(f"[INBURSA-VALID] ✗ FALLÓ ({len(issues)} issues):\n")
        for issue in issues:
            sys.stderr.write(f"  - {issue}\n")

    return result


# ──────────────────────────────────────────────────────────────
# DETECCIÓN OFUSCACIÓN
# ──────────────────────────────────────────────────────────────

def _is_obfuscated_pdf(doc):
    """
    Detecta si el PDF de Inbursa tiene texto ilegible (realmente ofuscado).
    Verifica si fitz extrae texto coherente: dígitos, meses en español,
    palabras bancarias comunes.
    """
    try:
        MESES = {'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
                 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'}
        PALABRAS_BANCO = {'SPEI', 'DEPOSITO', 'CARGO', 'ABONO', 'SALDO',
                          'TRANSFERENCIA', 'DOMICILIADO', 'RETIRO', 'FECHA'}

        pages_to_check = range(min(3, len(doc)))
        total_text = ""
        for i in pages_to_check:
            total_text += doc[i].get_text() or ""

        if not total_text.strip():
            sys.stderr.write("[INBURSA] sin texto extraíble → usando OCR\n")
            return True

        words_upper = set(re.findall(r'[A-ZÁÉÍÓÚÑÜ]{3,}', total_text.upper()))

        if words_upper & MESES:
            sys.stderr.write("[INBURSA] texto legible (meses encontrados) → path normal\n")
            return False
        if words_upper & PALABRAS_BANCO:
            sys.stderr.write("[INBURSA] texto legible (palabras bancarias) → path normal\n")
            return False

        private_use = sum(1 for c in total_text if ord(c) > 0xE000)
        ratio = private_use / max(len(total_text), 1)
        sys.stderr.write(f"[INBURSA] sin palabras reconocibles, private_use ratio={ratio:.4f}\n")
        if ratio > 0.05:
            sys.stderr.write("[INBURSA] PDF realmente ofuscado → usando OCR\n")
            return True

    except Exception as e:
        sys.stderr.write(f"[INBURSA] error en detección: {e}\n")

    return False


# ──────────────────────────────────────────────────────────────
# OCR
# ──────────────────────────────────────────────────────────────

def _ocr_page_text(page, dpi=150):
    """
    Renderiza la página como imagen y devuelve texto OCR via tesseract.
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
    """
    MESES_PAT = re.compile(
        r'^(?:\d{1,3}\s+)?'
        r'(' + '|'.join(meses_str.keys()) + r')\.?\s+'
        r'(?:(\d{1,2})[\[|\s]+)?'
        r'[^\d]{0,6}(\d{6,12})\s+'
        r'(.+)$',
        re.IGNORECASE
    )
    MONEY_PAT = re.compile(r'(\d{1,3}(?:,\d{3})*\.\d{2})')

    def _to_float(s):
        return float(s.replace(',', ''))

    def _clean_concepto(text):
        text = re.sub(r'^[¡!\|\[\u2014\u2013\-]+', '', text).strip()
        text = re.sub(r'[\|\!¡\[\u2014\u2013]', ' ', text).strip()
        text = re.sub(r'\s+', ' ', text)
        if len(text) > 2 and text[0] == 'C' and text[1] == 'C' and text[2].isupper():
            text = text[1:]
        return text

    def _finalize_tx(tx, prev_sal):
        if tx is None:
            return prev_sal
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
        bracket_m = re.match(r'^\[0(\d)(\d)', line)
        if bracket_m:
            last_d = int(bracket_m.group(2))
            if last_d > 0:
                return last_d, bracket_m.end()
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

        if 'BALANCE INICIAL' in line.upper():
            continue

        m = MESES_PAT.match(line)
        if m:
            if current_tx:
                prev_saldo = _finalize_tx(current_tx, prev_saldo)
                transactions.append(current_tx)

            mes_abbr = m.group(1).upper()[:3]
            day_inline = m.group(2)
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
                fecha = f'{year_str}-{mes_num}-01'
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

        if not current_tx.get('_day_found'):
            day_val, day_end = _try_extract_day(line)
            if day_val is not None:
                mes_part = current_tx['fecha'][:8]
                current_tx['fecha'] = mes_part + str(day_val).zfill(2)
                current_tx['_day_found'] = True
                rest_after_day = re.sub(r'^[\[\|\-¡!]+', '', line[day_end:].strip()).strip()
                if rest_after_day and not MONEY_PAT.search(rest_after_day):
                    current_tx['concepto'] = (current_tx['concepto'] + ' ' + rest_after_day).strip()
                continue

        line_cont = re.sub(r'^[\[\|\-¡!]+', '', line).strip()
        if line_cont and not MONEY_PAT.search(line_cont) and len(line_cont) < 120:
            if not re.search(r'\b\d{10,}\b', line_cont) and 'RFC NO DISPONIBLE' not in line_cont.upper():
                current_tx['concepto'] = (current_tx['concepto'] + ' ' + line_cont).strip()

    if current_tx:
        prev_saldo = _finalize_tx(current_tx, prev_saldo)
        transactions.append(current_tx)

    return transactions


# ──────────────────────────────────────────────────────────────
# EXTRACCIÓN FITZ (PDFs legibles)
# ──────────────────────────────────────────────────────────────

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
                        cols['concepto_x0'] = w['x1'] + 1
                    elif t == 'CONCEPTO':
                        if 'concepto_x0' not in cols:
                            cols['concepto_x0'] = w['x0']
                    elif t == 'CARGOS':
                        cols['cargo']    = w['x1']
                        cols['cargo_x0'] = w['x0']
                    elif t == 'ABONOS':
                        cols['abono'] = w['x1']
                    elif t == 'SALDO':
                        cols['saldo'] = w['x1']
                if 'cargo' in cols and 'abono' in cols and 'saldo' in cols:
                    return cols
    return None


def _extract_fitz_transactions(doc, year_str, meses_str):
    """
    Extrae movimientos de un PDF legible usando coordenadas fitz.
    Retorna lista de transacciones.
    """
    all_pages_words = [_fitz_words(doc[i]) for i in range(len(doc))]
    col_positions = _detect_col_positions(all_pages_words)

    # Coordenadas medidas del PDF Inbursa
    HARDCODED = {
        'cargo': 420.0, 'abono': 485.0, 'saldo': 570.0, 'cargo_x0': 351.0,
    }
    if not col_positions:
        sys.stderr.write("[INBURSA-FITZ] header no detectado — usando coordenadas hardcoded\n")
        col_positions = dict(HARDCODED)
        col_positions['concepto_x0'] = 106.0
    else:
        col_positions.update(HARDCODED)
        if 'concepto_x0' not in col_positions:
            col_positions['concepto_x0'] = 106.0
        sys.stderr.write(
            f"[INBURSA-FITZ] cols: cargo={col_positions['cargo']:.1f} "
            f"abono={col_positions['abono']:.1f} saldo={col_positions['saldo']:.1f} "
            f"concepto=[{col_positions.get('concepto_x0', 0):.0f},{col_positions.get('cargo_x0', 0):.0f}]\n"
        )

    cargo_x     = col_positions['cargo']
    abono_x     = col_positions['abono']
    saldo_x     = col_positions['saldo']
    concepto_x0 = col_positions['concepto_x0']
    concepto_x1 = col_positions['cargo_x0']
    mid_ca      = (cargo_x + abono_x) / 2
    mid_as      = (abono_x + saldo_x) / 2

    MESES_SET = set(meses_str.keys())
    in_extraction = False
    stop_found    = False
    transacciones = []

    for page_idx, page in enumerate(doc):
        if stop_found:
            break

        words = all_pages_words[page_idx]
        if not words:
            continue

        page_start_y = 0
        page_end_y   = page.rect.height
        lines_4 = _group_lines(words, y_tolerance=4)

        for lw in lines_4:
            tu = " ".join(w['text'].upper() for w in lw)
            if (("FECHA" in tu and "CARGOS" in tu and "SALDO" in tu)
                    or "DETALLE DE MOVIMIENTOS" in tu):
                page_start_y = lw[0]['bottom'] + 1
                in_extraction = True
            if (("SI DESEA RECIBIR PAGOS" in tu
                 or "RESUMEN DEL CFDI" in tu or "RESUMEN GRAFICO" in tu) and in_extraction):
                page_end_y = lw[0]['top'] - 2
                stop_found = True
                break

        if not in_extraction:
            continue

        active = [w for w in words if page_start_y <= w['top'] <= page_end_y]

        date_words  = [w for w in active if w['x0'] < 50]
        date_groups = _group_lines(date_words, y_tolerance=12)

        anchors = []
        for group in date_groups:
            month_words_in_group = [w for w in group if w['text'].upper().rstrip('.') in MESES_SET]
            if not month_words_in_group:
                continue

            if len(month_words_in_group) == 1:
                # Caso normal: un solo mes en el grupo → una sola transacción
                anchor_w = min(group, key=lambda x: x['top'])
                anchors.append({'top': anchor_w['top'], 'words': group})
            else:
                # Múltiples palabras de mes en el mismo grupo.
                # Ocurre cuando dos transacciones consecutivas están a ~11px de distancia
                # (menor que y_tolerance=12), haciendo que sus filas de fecha se fusionen.
                # Ejemplo: DIC.03 ref=111 a y=481.63 y DIC.03 ref=222 a y=492.86.
                # Solución: dividir en sub-anchors independientes, uno por cada mes.
                for mw in sorted(month_words_in_group, key=lambda w: w['top']):
                    # Incluir sólo las palabras de fecha cercanas a este mes (±3px)
                    sub_words = [w for w in group if abs(w['top'] - mw['top']) <= 3]
                    anchors.append({'top': mw['top'], 'words': sub_words})

        if not anchors:
            continue

        for i, anchor_data in enumerate(anchors):
            row_top = anchor_data['top']
            row_bot = (anchors[i + 1]['top'] - 1
                       if i + 1 < len(anchors) else page_end_y)

            # Nota: algunos PDFs Inbursa tienen montos con top ligeramente
            # menor (< 0.001 px) que el texto de la misma fila (floating point
            # de la renderización). Restar 2px evita perder esos montos.
            row_words = [w for w in active if (row_top - 2) <= w['top'] < row_bot]

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

            ref = ""
            for w in sorted(row_words, key=lambda x: x['top']):
                if 35 <= w['x0'] <= 110 and re.match(r'^\d{6,}$', w['text']):
                    ref = w['text']
                    break

            cargo     = 0.0
            abono     = 0.0
            saldo_val = None
            for w in row_words:
                if _is_money(w['text']):
                    val = float(re.sub(r'[\s,\u202f\xa0]', '', w['text']))
                    x1  = w['x1']
                    # Ignorar montos en la zona de CONCEPTO (x1 < 300).
                    # Ejemplo: "/Con Efectivo 455.00" a x1≈187 es texto
                    # informativo de un DEPOSITO EN CUENTA (depósito en efectivo),
                    # NO es un cargo/abono real.
                    if x1 < 300:
                        continue
                    if x1 > 500:
                        saldo_val = val
                    elif 421 <= x1 <= 500:
                        abono = val
                    elif 351 <= x1 <= 420:
                        cargo = val
                    else:
                        # Zona ambigua 300-350: usar centros de columna
                        if x1 > mid_as:   saldo_val = val
                        elif x1 > mid_ca: abono = val
                        else:             cargo = val

            if saldo_val is None:
                continue

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

    return transacciones


def _extract_ocr_transactions(doc, year_str, meses_str, initial_balance=None):
    """
    Extrae movimientos usando OCR de todas las páginas de movimientos.
    """
    all_ocr = ""
    in_movements = False
    for page_idx, page in enumerate(doc):
        page_ocr = _ocr_page_text(page)
        if not in_movements:
            if 'DETALLE DE MOVIMIENTOS' in page_ocr.upper():
                in_movements = True
            if re.search(r'^(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\.',
                         page_ocr, re.MULTILINE | re.IGNORECASE):
                in_movements = True
        if in_movements:
            all_ocr += page_ocr + "\n"
            if 'SI DESEA RECIBIR PAGOS' in page_ocr.upper():
                break

    sys.stderr.write(f"[INBURSA-OCR] texto OCR total: {len(all_ocr)} chars\n")
    transactions = _parse_ocr_transactions(all_ocr, year_str, meses_str, initial_balance)
    sys.stderr.write(f"[INBURSA-OCR] transacciones extraídas: {len(transactions)}\n")
    return transactions


# ──────────────────────────────────────────────────────────────
# PUNTO DE ENTRADA PRINCIPAL
# ──────────────────────────────────────────────────────────────

def extract_inbursa(pdf_path):
    """
    Extrae movimientos de un estado de cuenta Inbursa.

    Estrategia (PDFs legibles):
      1. Extrae carátula (fitz + OCR fallback) → SA, CARGOS, ABONOS, SF
      2. Intenta extracción fitz
      3. Valida vs carátula: SA + ABONOS - CARGOS = SF
      4. Si valida OK → usa fitz
      5. Si falla → intenta OCR
      6. Valida OCR vs carátula
      7. Usa el resultado que valide (o el OCR si fitz falla)

    PDFs ofuscados: solo OCR desde el inicio.

    El resultado incluye campo 'validation' con el reporte de validación.
    """
    meses_str = {
        "ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04",
        "MAY": "05", "JUN": "06", "JUL": "07", "AGO": "08",
        "SEP": "09", "OCT": "10", "NOV": "11", "DIC": "12"
    }

    summary_base = {
        "initial_balance": None,
        "final_balance": None,
        "total_cargos": 0.0,
        "total_abonos": 0.0,
        "account_number": "PREDETERMINADA",
        "period": ""
    }

    try:
        import fitz

        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            return {"movements": [], "summary": summary_base, "validation": None}

        # ── 1. CARÁTULA ───────────────────────────────────────
        caratula = _extract_caratula(doc, meses_str)
        year_str = caratula["year_str"]

        summary_base["account_number"] = caratula["account_number"]
        summary_base["period"]         = caratula["period"]
        summary_base["initial_balance"] = caratula.get("initial_balance")
        summary_base["final_balance"]   = caratula.get("final_balance")
        if caratula.get("total_cargos") is not None:
            summary_base["total_cargos"] = caratula["total_cargos"]
        if caratula.get("total_abonos") is not None:
            summary_base["total_abonos"] = caratula["total_abonos"]

        # ── 2. DETECTAR OFUSCACIÓN ───────────────────────────
        obfuscated = _is_obfuscated_pdf(doc)

        transacciones = []
        validation    = None
        method_used   = None

        if obfuscated:
            # ── PATH OCR (único) ──────────────────────────────
            sys.stderr.write("[INBURSA] PDF ofuscado → OCR\n")
            transacciones = _extract_ocr_transactions(doc, year_str, meses_str, caratula.get("initial_balance"))
            validation    = _validate_movements(transacciones, caratula)
            method_used   = "ocr"

        else:
            # ── PATH FITZ → validar → OCR si falla ───────────
            sys.stderr.write("[INBURSA] PDF legible → extracción fitz\n")
            fitz_txs  = _extract_fitz_transactions(doc, year_str, meses_str)
            fitz_val  = _validate_movements(fitz_txs, caratula)

            if fitz_val['is_valid'] or not fitz_val['has_caratula']:
                # Fitz validó (o no hay carátula para comparar) → usar fitz
                transacciones = fitz_txs
                validation    = fitz_val
                method_used   = "fitz"
                if not fitz_val['has_caratula']:
                    sys.stderr.write("[INBURSA] Sin carátula completa — usando fitz sin validar\n")
            else:
                # Fitz falló → intentar OCR
                sys.stderr.write("[INBURSA] fitz no validó → intentando OCR como fallback\n")
                ocr_txs = _extract_ocr_transactions(doc, year_str, meses_str, caratula.get("initial_balance"))
                ocr_val = _validate_movements(ocr_txs, caratula)

                if ocr_val['is_valid']:
                    sys.stderr.write("[INBURSA] OCR validó ✓ — usando OCR\n")
                    transacciones = ocr_txs
                    validation    = ocr_val
                    method_used   = "ocr_fallback"
                else:
                    # Ninguno validó: usar el que tenga menor discrepancia total
                    def _total_discrepancy(v):
                        d = 0.0
                        for key_pair in [('computed_cargos', 'caratula_cargos'),
                                         ('computed_abonos', 'caratula_abonos'),
                                         ('computed_saldo_final', 'caratula_saldo_actual')]:
                            a = v.get(key_pair[0]) or 0
                            b = v.get(key_pair[1]) or 0
                            d += abs((a or 0) - (b or 0))
                        return d

                    fitz_disc = _total_discrepancy(fitz_val)
                    ocr_disc  = _total_discrepancy(ocr_val)
                    sys.stderr.write(
                        f"[INBURSA] ADVERTENCIA: ni fitz ni OCR validaron. "
                        f"discrepancia fitz={fitz_disc:.2f} ocr={ocr_disc:.2f} — "
                        f"usando {'fitz' if fitz_disc <= ocr_disc else 'ocr'}\n"
                    )
                    if fitz_disc <= ocr_disc:
                        transacciones = fitz_txs
                        validation    = fitz_val
                        method_used   = "fitz_unvalidated"
                    else:
                        transacciones = ocr_txs
                        validation    = ocr_val
                        method_used   = "ocr_unvalidated"

        doc.close()

        # ── 3. LIMPIAR Y EMITIR ───────────────────────────────
        transacciones = [
            t for t in transacciones
            if t["concepto"] or t["cargo"] > 0 or t["abono"] > 0
        ]

        if validation:
            validation['method_used'] = method_used

        # Actualizar summary con totales reales de movimientos extraídos
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

        return {
            "movements":  transacciones,
            "summary":    summary_base,
            "validation": validation,
        }

    except Exception as e:
        import traceback
        sys.stderr.write(f"Error procesando INBURSA: {e}\n{traceback.format_exc()}\n")
        return {"movements": [], "summary": summary_base, "validation": None}
