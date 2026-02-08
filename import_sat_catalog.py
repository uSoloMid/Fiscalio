import pdfplumber
import os
import re
import json

def transform_code(sat_code):
    parts = sat_code.split('.')
    aaa = parts[0].zfill(3)
    bb = "00"
    ccc = "000"
    if len(parts) > 1:
        bb = parts[1].zfill(2)
    return f"{aaa}-{bb}-{ccc}"

def get_type_and_nat(sat_code):
    try:
        prefix = int(sat_code.split('.')[0])
        acc_type = "Otros"
        nat = "Deudora"
        
        if 100 <= prefix < 200:
            acc_type = "Activo"
            nat = "Deudora"
        elif 200 <= prefix < 300:
            acc_type = "Pasivo"
            nat = "Acreedora"
        elif 300 <= prefix < 400:
            acc_type = "Capital"
            nat = "Acreedora"
        elif 400 <= prefix < 500:
            acc_type = "Ingresos"
            nat = "Acreedora"
        elif 500 <= prefix < 900:
            acc_type = "Egresos"
            nat = "Deudora"
        return acc_type, nat
    except:
        return "Otros", "Deudora"

def parse_pdf(pdf_path):
    catalog = []
    print("--- Extrayendo texto del PDF ---")
    
    # Patrón: Opcional nivel (1-2 dígitos) seguido de código (3 dígitos + opcional punto y dígitos) seguido de nombre
    # Ejemplo: "1 102 Bancos" o "2 102.01 Bancos nacionales" o "102 Bancos"
    patron = re.compile(r'^(?:\d\s+)?(\d{3}(?:\.\d+)?)\s+(.+)$')
    
    # Exclusión de palabras clave que no son cuentas
    exclusions = ["Código Agrupador", "Nombre de la Cuenta", "Página", "Anexo 24"]

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                for line in text.split('\n'):
                    line = line.strip()
                    if any(ex in line for ex in exclusions): continue
                    
                    match = patron.match(line)
                    if match:
                        code = match.group(1)
                        name = match.group(2)
                        
                        # Limpiar nombre de posibles números de página al final
                        name = re.sub(r'\s+\d+$', '', name).strip()
                        
                        acc_type, nat = get_type_and_nat(code)
                        level = 1 if '.' not in code else 2
                        
                        catalog.append({
                            "codigo_sat": code,
                            "codigo_interno": transform_code(code),
                            "nombre": name,
                            "nivel": level,
                            "tipo": acc_type,
                            "naturaleza": nat
                        })
    return catalog

if __name__ == "__main__":
    pdf_file = "codigo_agrupador.pdf"
    if os.path.exists(pdf_file):
        items = parse_pdf(pdf_file)
        
        # Eliminar duplicados si los hay
        visto = set()
        unique_items = []
        for item in items:
            if item['codigo_sat'] not in visto:
                unique_items.append(item)
                visto.add(item['codigo_sat'])
        
        # Guardar en PHP Seeder formato
        seeder_path = "sat-api/database/seeders/AccountsTableSeeder.php"
        with open(seeder_path, "w", encoding="utf-8") as f:
            f.write("<?php\n\nnamespace Database\\Seeders;\n\nuse Illuminate\\Database\\Seeder;\nuse Illuminate\\Support\\Facades\\DB;\n\nclass AccountsTableSeeder extends Seeder\n{\n    public function run(): void\n    {\n        DB::table('accounts')->truncate();\n        $accounts = [\n")
            for item in unique_items:
                clean_name = item['nombre'].replace("'", "\\'")
                f.write(f"            ['internal_code' => '{item['codigo_interno']}', 'sat_code' => '{item['codigo_sat']}', 'name' => '{clean_name}', 'level' => {item['nivel']}, 'type' => '{item['tipo']}', 'naturaleza' => '{item['naturaleza']}', 'created_at' => now(), 'updated_at' => now()],\n")
            f.write("        ];\n\n")
            f.write("        foreach (array_chunk($accounts, 100) as $chunk) {\n")
            f.write("            DB::table('accounts')->insert($chunk);\n")
            f.write("        }\n    }\n}\n")
            
        print(f"Seeder generado con {len(unique_items)} cuentas en: {seeder_path}")
    else:
        print(f"Error: No se encontró {pdf_file}")
