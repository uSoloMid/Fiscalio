import pdfplumber
import re

def parse_banamex():
    txs = []
    with pdfplumber.open("BANAMEX.pdf") as pdf:
        year_str = "2026"
        for i, page in enumerate(pdf.pages):
            text = page.extract_text(layout=True)
            if not text: continue
            
            if i == 0:
                ym = re.search(r"AL \d{2} DE [A-Z]+ DE (\d{4})", text)
                if ym: year_str = ym.group(1)
            
            lines = text.split("\n")
            in_details = False
            
            current_tx = None
            
            for line in lines:
                if "DETALLE DE OPERACIONES" in line:
                    in_details = True
                    continue
                if in_details and "SALDO ANTERIOR" in line:
                    in_details = True
                    continue
                    
                if not in_details: continue
                if "CADENA ORIGINAL" in line or "SELLO DIGITAL" in line:
                    break
                    
                # line typical length ~ 80-100 chars
                if len(line.strip()) == 0: continue
                
                # Check for date (e.g. "   06 ENE PAGO RECIBIDO...")
                date_match = re.search(r"^\s*(\d{2}\s+[A-Z]{3}) (.*)", line)
                
                if date_match and len(line) > 30: # At least conceptually long
                    # Save previous transaction
                    if current_tx:
                        txs.append(current_tx)
                        
                    raw_date = date_match.group(1)
                    rest_of_line = line[line.find(raw_date)+6:]
                    
                    # Columns in Banamex Layout (approximate indices):
                    # RETIROS ends before DEPOSITOS.
                    # Looking at layout:
                    # '        HORA 16:08 SUC 0859                      140,000.00 307,914.09   '
                    # finding amounts from right to left is safer.
                    
                    current_tx = {
                        "fecha_raw": raw_date,
                        "concepto": "",
                        "retiros": 0.0,
                        "depositos": 0.0,
                        "saldo": 0.0
                    }
                
                # If we are in a transaction block, parse lines
                if current_tx:
                    # Let's clean the amounts from the right
                    # Split the line by spaces, anything ending that is a float is an amount
                    words = [w.strip() for w in line.split(" ") if w.strip()]
                    
                    # Are the last words amounts?
                    montos = []
                    while words:
                        last = words[-1]
                        if re.match(r"^-?\d{1,3}(,\d{3})*(\.\d{2})?$", last):
                            montos.insert(0, float(last.replace(",","")))
                            words.pop()
                        else:
                            break
                            
                    # Banamex Columns: RETIROS DEPOSITOS SALDO
                    # But if there's only 1 amount, we must figure out if it's RETIRO or DEPOSITO
                    # Let's rely on string index of the match! This is the magic of layout=True
                    
                    # Find where the numbers appear in the original line spaces
                    for m in montos:
                        m_str = "{:,.2f}".format(m)
                        idx = line.rfind(m_str)
                        if idx == -1:
                            m_str = "{:.2f}".format(m)
                            idx = line.rfind(m_str)
                            if idx == -1: idx = line.rfind(str(m))
                        
                        if idx > 0:
                            if 35 <= idx <= 50:
                                current_tx["retiros"] = m
                            elif 50 < idx <= 65:
                                current_tx["depositos"] = m
                            elif idx > 65:
                                current_tx["saldo"] = m
                                
                    concepto = " ".join(words)
                    # Ignore dates at the beginning when adding to concept
                    if date_match and concepto.startswith(date_match.group(1)):
                        concepto = concepto[6:].strip()
                        
                    current_tx["concepto"] += " " + concepto

            if current_tx:
                txs.append(current_tx)
    return txs

if __name__ == "__main__":
    for t in parse_banamex()[:5]: print(t)
