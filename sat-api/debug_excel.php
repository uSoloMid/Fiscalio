<?php
require __DIR__ . '/vendor/autoload.php';
$spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load('../cuentas.xls');
$rows = $spreadsheet->getActiveSheet()->toArray();
for ($i = 0; $i < 10; $i++) {
    var_dump($rows[$i]);
}
