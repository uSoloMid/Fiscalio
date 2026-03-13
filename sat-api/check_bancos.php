<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();
foreach ($rows as $row) {
    $code = trim($row[1] ?? '');
    if (strpos($code, '102') === 0) {
        echo "Code: $code | Name: {$row[2]}\n";
    }
}
