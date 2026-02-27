import fitz
import pdfplumber
import json

def debug_banamex():
    with open("debug_banamex.txt", "w", encoding="utf-8") as f:
        doc = fitz.open("BANAMEX.pdf")
        page = doc[0] # first page
        blocks = page.get_text("blocks")
        f.write("--- PyMuPDF Blocks Page 1 ---\n")
        cnt = 0
        for b in blocks:
            f.write(f"{b[:4]} -> {repr(b[4])}\n")
            cnt += 1
            if cnt > 40: break
            
        with pdfplumber.open("BANAMEX.pdf") as pdf:
            f.write("\n\n--- pdfplumber Tables Page 1 ---\n")
            tables = pdf.pages[0].extract_tables()
            for t in tables:
                f.write(str(t) + "\n")

def debug_bbva():
    with open("debug_bbva.txt", "w", encoding="utf-8") as f:
        doc = fitz.open("BBVA.pdf")
        page = doc[0]
        blocks = page.get_text("blocks")
        f.write("--- PyMuPDF Blocks Page 1 ---\n")
        for b in blocks[:40]:
            f.write(f"{b[:4]} -> {repr(b[4])}\n")
            
if __name__ == "__main__":
    debug_banamex()
    debug_bbva()
