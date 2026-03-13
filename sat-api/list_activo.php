<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();

echo "MUESTRA DEL ACTIVO (PRIMERAS 25):\n";
echo "====================================\n";
$count = 0;
foreach ($rows as $idx => $row) {
    if ($idx < 5)
        continue;
    $code = trim($row[1] ?? '');
    if (strpos($code, '1') === 0 && ($row[0] ?? '') == 'C') {
        if (strlen($code) == 8) {
            $code = substr($code, 0, 3) . '-' . substr($code, 3, 2) . '-' . substr($code, 5, 3);
        }
        printf("%-12s | %-40s | Nivel: %d | SAT: %s\n",
            $code,
            mb_substr($row[2], 0, 40),
            $row[7],
            $row[16] ?? '-'
        );
        $count++;
    }
    if ($count >= 25)
        break;
}
