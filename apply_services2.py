import re

path = r'c:\Fiscalio\ui\src\services.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

download_blob_func = '''
export async function downloadBlob(url: string, filename: string) {
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Error en la descarga');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
'''

if 'export async function downloadBlob' not in content:
    content += download_blob_func

replacements = [
    (r"export function exportCfdiPdf\(uuid: string\) \{\s*window\.open\(`\$\{API_BASE_URL\}/api/cfdis/\$\{uuid\}/pdf`, '_blank'\);\s*\}",
     "export async function exportCfdiPdf(uuid: string) { await downloadBlob(`${API_BASE_URL}/api/cfdis/${uuid}/pdf`, `CFDI_${uuid}.pdf`); }"),
    
    (r"export function exportDetailedBucketPdf\(params: any\) \{\s*const query = new URLSearchParams\(params\);\s*window\.open\(`\$\{API_BASE_URL\}/api/provisional/export-pdf\?` \+ query\.toString\(\), '_blank'\);\s*\}",
     "export async function exportDetailedBucketPdf(params: any) { const q = new URLSearchParams(params); await downloadBlob(`${API_BASE_URL}/api/provisional/export-pdf?${q}`, `Detalle_${params.bucket}.pdf`); }"),
     
    (r"window\.open\(`\$\{API_BASE_URL\}/api/sat/bulk-pdf\?\$\{query\.toString\(\)\}`, '_blank'\);",
     "await downloadBlob(`${API_BASE_URL}/api/sat/bulk-pdf?${query.toString()}`, 'Facturas.zip');"),
     
    (r"window\.open\(`\$\{API_BASE_URL\}/api/cfdis/export\?\$\{query\.toString\(\)\}`, '_blank'\);",
     "await downloadBlob(`${API_BASE_URL}/api/cfdis/export?${query.toString()}`, 'Facturas.xls');"),
     
    (r"window\.open\(`\$\{API_BASE_URL\}/api/provisional/export-excel\?\$\{query\.toString\(\)\}`, '_blank'\);",
     "await downloadBlob(`${API_BASE_URL}/api/provisional/export-excel?${query.toString()}`, `Resumen_${params.month}_${params.year}.xls`);"),
     
    (r"window\.open\(`\$\{API_BASE_URL\}/api/provisional/export-pdf-summary\?\$\{query\.toString\(\)\}`, '_blank'\);",
     "await downloadBlob(`${API_BASE_URL}/api/provisional/export-pdf-summary?${query.toString()}`, `Resumen_${params.month}_${params.year}.pdf`);"),
]

for idx, (target, replace) in enumerate(replacements):
    content = re.sub(target, replace, content)
    # also add async to the functions if they were exported as function 
    # except window.open which might be inside a function. Let's fix function signature for `export function` -> `export async function` where needed.

# Fix signature if it's missing async
content = content.replace("export function exportInvoicesZip", "export async function exportInvoicesZip")
content = content.replace("export function exportCfdisExcel", "export async function exportCfdisExcel")
content = content.replace("export function exportProvisionalExcel", "export async function exportProvisionalExcel")
content = content.replace("export function exportProvisionalPdfSummary", "export async function exportProvisionalPdfSummary")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Blob downloads updated.")
