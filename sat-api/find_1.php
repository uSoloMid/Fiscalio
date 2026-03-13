<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();

echo "BUSCANDO CUENTAS QUE EMPIEZAN CON '1':\n";
$count = 0;
foreach ($rows as $idx => $row) {
    if ($idx < 5)
        continue;
    $code = trim($row[1] ?? '');
    if (strpos($code, '1') === 0 && strlen($code) >= 3) {
        $name = $row[2] ?? '';
        echo "Row: $idx | TypeCol: {$row[0]} | Code: $code | Name: $name | SAT: " . ($row[16] ?? '-') . "\n";
        $count++;
    }
    if ($count >= 20)
        break;
}
