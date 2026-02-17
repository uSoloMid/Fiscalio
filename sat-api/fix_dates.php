<?php
// Fix for incorrect fiscal dates due to Global Information node override
// Target: Update fecha_fiscal to match fecha (emission date) for all invoices

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;
use Illuminate\Support\Facades\DB;

echo "Starting date correction script...\n";

// Count total records to process
$total = Cfdi::count();
echo "Found {$total} total invoices.\n";

$processed = 0;
$updated = 0;

Cfdi::chunk(500, function ($cfdis) use (&$processed, &$updated) {
    foreach ($cfdis as $cfdi) {
        $processed++;

        // Check if fecha_fiscal is different from fecha (ignoring time if necessary, but here we want exact match logic or strict day match)
        // Actually, we just want to force fecha_fiscal = fecha for ALL invoices based on the new rule.

        // Compare as strings to avoid minor object differences if they are same value
        $fecha = $cfdi->fecha;
        $fechaFiscal = $cfdi->fecha_fiscal;

        if ($fecha != $fechaFiscal) {
            $cfdi->fecha_fiscal = $fecha;
            $cfdi->save();
            $updated++;
        }

        if ($processed % 100 == 0) {
            echo "Processed {$processed}...\n";
        }
    }
});

echo "Finished.\n";
echo "Processed: {$processed}\n";
echo "Updated: {$updated}\n";
