import re

with open("sat-api/app/Http/Controllers/ProvisionalControlController.php", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Fix names
text = text.replace("$clientName = $client ? $client->name : $rfc;", "$clientName = $client ? $client->legal_name : $rfc;")

# 2. Fix updateDeductibility
text = text.replace("Cfdi::where('uuid', $uuid)->firstOrFail()", "\\App\\Models\\Cfdi::where('uuid', $uuid)->firstOrFail()")

# 3. Fix getBucketDetails mappings
pattern_incomes = r"'forma_pago' => \$c->forma_pago, 'is_deductible' => \(bool\)\(\$c->is_deductible \?\? true\), 'uso_cfdi' => \$c->uso_cfdi \?\? 'G03'"
repl_incomes = r"'forma_pago' => $c->forma_pago, 'is_deductible' => isset($c->is_deductible) ? (bool)$c->is_deductible : !(str_starts_with($c->uso_cfdi ?? '', 'D')), 'uso_cfdi' => $c->uso_cfdi ?? 'G03', 'reason' => $c->deduction_type ?? ((str_starts_with($c->uso_cfdi ?? '', 'D')) ? 'Gasto Personal (Anual)' : 'No deducible')"
text = re.sub(pattern_incomes, repl_incomes, text)

pattern_reps = r"'forma_pago' => \$p->forma_pago \?\? '99', 'is_deductible' => \(bool\)\(\$p->is_deductible \?\? true\), 'uso_cfdi' => \$p->uso_cfdi \?\? 'G03'"
repl_reps = r"'forma_pago' => $p->forma_pago ?? '99', 'is_deductible' => isset($p->is_deductible) ? (bool)$p->is_deductible : !(str_starts_with($p->uso_cfdi ?? '', 'D')), 'uso_cfdi' => $p->uso_cfdi ?? 'G03', 'reason' => $p->deduction_type ?? ((str_starts_with($p->uso_cfdi ?? '', 'D')) ? 'Gasto Personal (Anual)' : 'No deducible')"
text = re.sub(pattern_reps, repl_reps, text)

pattern_pend = r"if \(\$bal < 0\.05\) return null;\s*\$ratio = \$c->total > 0 \? \(\$bal / \(float\)\$c->total\) : 0;\s*\$nombre = \(\$dir === 'ingresos'\) \? \$c->name_receptor : \$c->name_emisor;\s*return \[\s*'uuid' => \$c->uuid, 'fecha' => substr\(\$c->fecha_fiscal, 0, 10\), 'nombre' => \$nombre,\s*'subtotal' => \(float\)\$c->subtotal \* \$ratio \* \$tc, 'iva' => \(float\)\(\$c->iva \?\? 0\) \* \$tc,\s*'total' => \$bal \* \$tc, 'metodo_pago' => \$c->metodo_pago, 'is_deductible' => \(bool\)\(\$c->is_deductible \?\? true\), 'uso_cfdi' => \$c->uso_cfdi \?\? 'G03', 'forma_pago' => \$c->forma_pago\s*\];"
repl_pend = r"""
                    if ($bal < 0.05) return null;
                    $ratio = $c->total > 0 ? ($bal / (float)$c->total) : 0;
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    
                    $isDeductible = isset($c->is_deductible) ? (bool)$c->is_deductible : !(str_starts_with($c->uso_cfdi ?? '', 'D'));
                    $reason = null;
                    if (!$isDeductible) {
                        $uso = $c->uso_cfdi ?? '';
                        $reason = $c->deduction_type ?? ((str_starts_with($uso, 'D')) ? 'Gasto Personal (Anual)' : 'No deducible');
                    }
                    
                    return [
                        'uuid' => $c->uuid, 'fecha' => substr($c->fecha_fiscal, 0, 10), 'nombre' => $nombre,
                        'subtotal' => (float)$c->subtotal * $ratio * $tc, 'iva' => (float)($c->iva ?? 0) * $tc,
                        'total' => $bal * $tc, 'metodo_pago' => $c->metodo_pago, 'is_deductible' => $isDeductible, 'uso_cfdi' => $c->uso_cfdi ?? 'G03', 'forma_pago' => $c->forma_pago, 'reason' => $reason
                    ];
"""
text = re.sub(pattern_pend, repl_pend.strip(), text)

# 4. Fix fetch details PDF
pattern_pdf = r"""            \$details = \[
                'ingresos' => collect\(\),
                'egresos' => collect\(\),
            \];

            foreach\(\['ingresos_total_pue', 'ingresos_total_rep'\] as \$b\) \{
                \$req = new Request\(\feature\['rfc' => \$rfc, 'year' => \$year, 'month' => \$month, 'bucket' => \$b\]\);
                \$items = collect\(\$this->getBucketDetails\(\$req\)->original\);
                \$details\['ingresos'\] = \$details\['ingresos'\]->concat\(\$items\);
            \}

            foreach\(\['egresos_total_pue', 'egresos_total_rep'\] as \$b\) \{
                \$req = new Request\(\['rfc' => \$rfc, 'year' => \$year, 'month' => \$month, 'bucket' => \$b\]\);
                \$items = collect\(\$this->getBucketDetails\(\$req\)->original\);
                \$details\['egresos'\] = \$details\['egresos'\]->concat\(\$items\);
            \}"""

repl_pdf = r"""            // Fetch details to include in the PDF
            $details = [
                'ingresos_considerados' => collect(),
                'egresos_considerados' => collect(),
                'ingresos_pendientes' => collect(),
                'egresos_pendientes' => collect(),
                'no_deducibles' => collect()
            ];

            // Ingresos Considerados
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'ingresos_total']);
            $details['ingresos_considerados'] = collect($this->getBucketDetails($req)->original);

            // Egresos Considerados
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_total']);
            $details['egresos_considerados'] = collect($this->getBucketDetails($req)->original);

            // Pendientes Ingresos
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'ingresos_pendiente']);
            $details['ingresos_pendientes'] = collect($this->getBucketDetails($req)->original);

            // Pendientes Egresos
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_pendiente']);
            $details['egresos_pendientes'] = collect($this->getBucketDetails($req)->original);

            // No deducibles 
            $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_nodeducibles']);
            $nd1 = collect($this->getBucketDetails($req)->original);
            $req2 = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_nodeducibles_pendiente']);
            $nd2 = collect($this->getBucketDetails($req2)->original);
            $details['no_deducibles'] = $nd1->concat($nd2);"""
text = re.sub(r"            \$details = \[\s*'ingresos' => collect\(\),\s*'egresos' => collect\(\),\s*\];\s*foreach.*?\}", repl_pdf.strip(), text, flags=re.DOTALL)


with open("sat-api/app/Http/Controllers/ProvisionalControlController.php", "w", encoding="utf-8") as f:
    f.write(text)

print("Patched!")
