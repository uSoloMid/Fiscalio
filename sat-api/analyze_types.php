<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();

echo "TIPOS ENCONTRADOS:\n";
$types = [];
foreach ($rows as $idx => $row) {
    if ($idx === 0)
        continue;
    $type = $row[0] ?? 'EMPTY';
    $types[$type] = ($types[$type] ?? 0) + 1;
}
print_r($types);

echo "\nPRIMERAS 10 CUENTAS:\n";
for ($i = 1; $i <= 10; $i++) {
    if (!isset($rows[$i]))
        break;
    echo "T: {$rows[$i][0]} | Code: {$rows[$i][1]} | Name: {$rows[$i][2]}\n";
}
