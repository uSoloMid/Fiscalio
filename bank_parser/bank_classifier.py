import fitz
import sys

def identify_bank(pdf_path: str) -> str:
    """
    Lee las primeras páginas del PDF usando PyMuPDF para detectar 
    rápido a qué banco pertenece.
    """
    try:
        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            return None
            
        # Concatenar texto de las primeras 3 páginas para mayor cobertura
        pages_to_scan = min(3, len(doc))
        full_text = ""
        for i in range(pages_to_scan):
            full_text += doc[i].get_text().upper()

        first_page_text = doc[0].get_text().upper()

        # IMPORTANTE: No usar simplemente "BBVA" porque puede aparecer en movimientos SPEI.
        # Buscar identificadores exclusivos o fuertes por banco.

        if "CITIBANAMEX" in first_page_text or "BANAMEX" in first_page_text[:1000]:
            return "banamex"

        if "BANBAJIO" in full_text or "BANCO DEL BAJIO" in full_text:
            return "banbajio"

        if "HSBC" in first_page_text[:1000]:
            return "hsbc"

        # Inbursa ANTES de BBVA — Inbursa puede mencionar BBVA en sus movimientos SPEI
        if ("INBURSA" in full_text
                or "CLIENTE INBURSA" in full_text
                or "BANCO INBURSA" in full_text
                or "RESUMEN DE SALDOS" in first_page_text[:3000]
                or "ÓÄÖÓÕ" in full_text):
            return "inbursa"

        if "BBVA" in first_page_text[:1000] or "BANCOMER" in first_page_text[:1000]:
            return "bbva"

        # Si PyMuPDF no extrae texto (PDF escaneado/ofuscado)
        if len(first_page_text.strip()) < 50:
            if "INBURSA" in pdf_path.upper():
                return "inbursa"
            if "BBVA" in pdf_path.upper():
                return "bbva"
            return "bbva"

        return "banamex"
    except Exception as e:
        sys.stderr.write(f"Error clasificando: {e}\n")
        return None
