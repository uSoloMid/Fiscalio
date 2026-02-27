import re

with open("sat-api/app/Http/Controllers/ProvisionalControlController.php", "r", encoding="utf-8") as f:
    text = f.read()

# 1. getInvoicesSum
text = text.replace(
    'DB::raw("SUM(subtotal * $tcSql) as subtotal"),',
    'DB::raw("SUM((subtotal - COALESCE(descuento, 0)) * $tcSql) as subtotal"),'
)

# 2. getRepSum
text = text.replace(
    'DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.subtotal / NULLIF(ppds.total, 0)) * $tcPago) as subtotal"),',
    'DB::raw("SUM(cfdi_payments.monto_pagado * ((ppds.subtotal - COALESCE(ppds.descuento, 0)) / NULLIF(ppds.total, 0)) * $tcPago) as subtotal"),'
)

# 3. getPendSum
text = text.replace(
    "$res['subtotal'] += (float)$c->subtotal * $ratio * $tc;",
    "$res['subtotal'] += ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $ratio * $tc;"
)

# 4. getBucketDetails - Invoices mapping (PUE/PPD)
# Look for: 'subtotal' => (float)$c->subtotal * $tc,
# We will use regex to capture it correctly in the mapping.
text = re.sub(
    r"'subtotal'\s*=>\s*\(float\)\$c->subtotal\s*\*\s*\$tc,",
    r"'subtotal' => ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $tc,",
    text
)

# 5. getBucketDetails - REPs mapping
# Look for: 'subtotal' => (float)($p->ppd_sub ?? 0) * $ratio * $tc,
# But wait, we need 'ppds.descuento as ppd_desc' in the query!
# Let's add it to the select.
text = text.replace(
    "'cfdi_payments.*', 'ppds.name_receptor', 'ppds.name_emisor', 'ppds.subtotal as ppd_sub', 'ppds.iva as ppd_iva', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc', 'ppds.forma_pago', 'ppds.is_deductible', 'ppds.uso_cfdi'",
    "'cfdi_payments.*', 'ppds.name_receptor', 'ppds.name_emisor', 'ppds.subtotal as ppd_sub', 'ppds.iva as ppd_iva', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc', 'ppds.forma_pago', 'ppds.is_deductible', 'ppds.uso_cfdi', 'ppds.descuento as ppd_desc'"
)

text = re.sub(
    r"'subtotal'\s*=>\s*\(float\)\(\$p->ppd_sub \?\? 0\)\s*\*\s*\$ratio\s*\*\s*\$tc,",
    r"'subtotal' => ((float)($p->ppd_sub ?? 0) - (float)($p->ppd_desc ?? 0)) * $ratio * $tc,",
    text
)

# 6. getBucketDetails - PendSum mapping
text = re.sub(
    r"'subtotal'\s*=>\s*\(float\)\$c->subtotal\s*\*\s*\$ratio\s*\*\s*\$tc,",
    r"'subtotal' => ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $ratio * $tc,",
    text
)

with open("sat-api/app/Http/Controllers/ProvisionalControlController.php", "w", encoding="utf-8") as f:
    f.write(text)

print("Patch subtotal applied successfully")
