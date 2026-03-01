import pdfplumber
import re
import sys

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
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            year_str = "2026"
            in_details = False
            current_tx = None
            stop_all = False
            
            # --- PARTE 1: METADATOS (Página 1) ---
            first_page = pdf.pages[0]
            first_text = first_page.extract_text() or ""
            
            # 1. Detectar Periodo: AL 31 DE ENERO DE 2026
            ym = re.search(r"AL (\d{2}) DE ([A-Z]+) DE (\d{4})", first_text, re.I)
            if ym: 
                year_str = ym.group(3)
                month_name = ym.group(2).upper()
                summary["period"] = f"{month_name[:3]}-{year_str}"
            
            # 2. Detectar No. Cuenta o Cliente
            acc_match = re.search(r"CLIENTE:\s+(\d+)", first_text, re.I)
            if acc_match: summary["account_number"] = acc_match.group(1)

            # 3. Detectar Balances en carátula si existen
            words = first_page.extract_words()
            for i, w in enumerate(words):
                txt = w['text'].upper()
                if "ANTERIOR" in txt:
                    for next_w in words[i+1:i+10]:
                        if abs(next_w['top'] - w['top']) < 10:
                            clean = next_w['text'].replace("$","").replace(",","")
                            try:
                                summary["initial_balance"] = float(clean)
                                break
                            except: pass
                if "ACTUAL" in txt or "FINAL" in txt:
                    for next_w in words[i+1:i+10]:
                        if abs(next_w['top'] - w['top']) < 10:
                            clean = next_w['text'].replace("$","").replace(",","")
                            try:
                                summary["final_balance"] = float(clean)
                                break
                            except: pass

            # --- PARTE 2: MOVIMIENTOS ---
            for page in pdf.pages:
                if stop_all: break
                
                words = page.extract_words(x_tolerance=2, y_tolerance=3)
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
                if current_line: lines.append(current_line)

                cutoff_y = page.height
                for line_words in lines:
                    text_line = " ".join([w['text'] for w in line_words]).upper()
                    if any(kw in text_line for kw in ["BANCA ELECTRÓNICA", "SALDO PROMEDIO MINIMO", "COMISIONES COBRADAS"]):
                        cutoff_y = min(cutoff_y, line_words[0]['top'] - 2)
                        stop_all = True
                        break
                        
                valid_lines = [lw for lw in lines if lw[0]['top'] < cutoff_y]

                for line_words in valid_lines:
                    text_line = " ".join([w['text'] for w in line_words])
                    
                    if "DETALLE DE OPERACIONES" in text_line.upper():
                        in_details = True
                        continue
                    
                    if not in_details: continue
                    if "SALDO ANTERIOR" in text_line.upper(): continue
                        
                    first_word = line_words[0]
                    date_match = None
                    if first_word['x0'] < 70 and len(line_words) >= 2:
                        match_str = f"{line_words[0]['text']} {line_words[1]['text']}"
                        date_match = re.match(r"^(\d{2}) ([A-Z]{3})$", match_str.upper())
                        
                    if date_match and "SALDO" not in text_line.upper():
                        if current_tx: transacciones.append(current_tx)
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
                    
                    if current_tx:
                        desc_parts = []
                        for i, w in enumerate(line_words):
                            tw = w['text']
                            x1 = w['x1']
                            x0 = w['x0']
                            
                            if date_match and i < 2 and x0 < 70: continue
                            
                            # Regex flexible para cifras
                            if re.match(r"^-?[\d,]+\.\d{2}$", tw):
                                val = float(tw.replace(",", ""))
                                # Banamex: Retiros (x1~320), Depositos (x1~400), Saldo (x1~480)
                                if 240 <= x1 <= 345:
                                    current_tx["cargo"] = val
                                elif 346 <= x1 <= 435:
                                    current_tx["abono"] = val
                                elif x1 >= 436:
                                    current_tx["saldo"] = val
                            else:
                                desc_parts.append(tw)
                                
                        inc_desc = " ".join(desc_parts)
                        if inc_desc:
                            current_tx["concepto"] = (current_tx["concepto"] + " " + inc_desc).strip()
                        
                        ref_match = re.search(r"(REF\.|RASTREO:)\s*([A-Z0-9]+)", current_tx["concepto"].upper())
                        if ref_match: current_tx["referencia"] = ref_match.group(2)

            if current_tx: transacciones.append(current_tx)
                
        return {"movements": transacciones, "summary": summary}
    except Exception as e:
        sys.stderr.write(f"Error procesando Banamex: {e}\n")
        return {"movements": [], "summary": summary}
