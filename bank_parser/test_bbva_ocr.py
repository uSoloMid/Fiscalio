import fitz
import pytesseract
from PIL import Image
import io

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

with open("bbva_ocr.txt", "w", encoding="utf-8") as f:
    doc = fitz.open("BBVA.pdf")
    for page in doc:
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img, config='--psm 6', lang="spa+eng")
        f.write(text + "\n---PAGE---\n")
