<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();

echo "MUESTRAS DE CADA RANGO:\n";
$ranges = ['1', '2', '3', '4', '5', '6', '7', '8'];
foreach ($ranges as $r) {
    echo "\nRANGO $r:\n";
    $count = 0;
    foreach ($rows as $row) {
        $code = trim($row[1] ?? '');
        if (strpos($code, $r) === 0 && strlen($code) >= 3 && $row[0] == 'C') {
            echo "Code: $code | Name: {$row[2]}\n";
            $count++;
        }
        if ($count >= 3)
            break;
    }
}
