from adapters.bbva import extract_bbva
import fitz
import pytesseract
from PIL import Image
import io

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

doc = fitz.open("BBVA.pdf")
page = doc[0]
mat = fitz.Matrix(2, 2)
pix = page.get_pixmap(matrix=mat)
img = Image.open(io.BytesIO(pix.tobytes("png")))
text = pytesseract.image_to_string(img, lang="spa+eng")
print(text[:1500])
