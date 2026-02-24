<?php
require 'vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$count = \App\Models\Cfdi::where('uso_cfdi', 'like', 'D%')
    ->where(function ($q) {
        $q->whereNull('is_deductible')->orWhere('is_deductible', true);
    })->update([
    'is_deductible' => false,
    'deduction_type' => 'Gasto Personal (Anual)'
]);

echo "Updated $count invoices automatically to No Deducible.\n";
