<?php
require 'sat-api/vendor/autoload.php';
$app = require_once 'sat-api/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

use App\Models\Cfdi;
use App\Models\CfdiPayment;
use App\Services\XmlProcessorService;

$processor = new XmlProcessorService();

echo "Starting backfill of payments...\n";

$paymentCfdis = Cfdi::where('tipo', 'P')->get();
$total = $paymentCfdis->count();
echo "Found $total payment CFDIs.\n";

$processed = 0;
$created = 0;

foreach ($paymentCfdis as $cfdi) {
    // Correct absolute path
    $absolutePath = base_path('storage/app/') . $cfdi->path_xml;

    if (!$cfdi->path_xml || !file_exists($absolutePath)) {
        // echo "Missing XML for UUID: " . $cfdi->uuid . " Path: $absolutePath\n";
        continue;
    }

    $xmlContent = file_get_contents($absolutePath);
    $data = $processor->parseCfdi($xmlContent);

    if ($data && !empty($data['payments'])) {
        foreach ($data['payments'] as $p) {
            // Check if already exists to avoid duplicates
            $exists = CfdiPayment::where('uuid_pago', $data['uuid'])
                ->where('uuid_relacionado', $p['uuid_relacionado'])
                ->where('num_parcialidad', $p['num_parcialidad'])
                ->exists();

            if (!$exists) {
                CfdiPayment::create([
                    'uuid_pago' => $data['uuid'],
                    'uuid_relacionado' => $p['uuid_relacionado'],
                    'fecha_pago' => $p['fecha_pago'],
                    'monto_pagado' => $p['monto_pagado'],
                    'num_parcialidad' => $p['num_parcialidad'],
                    'saldo_anterior' => $p['saldo_anterior'],
                    'saldo_insoluto' => $p['saldo_insoluto'],
                    'moneda_pago' => $p['moneda_pago'],
                    'tipo_cambio_pago' => $p['tipo_cambio_pago'],
                ]);
                $created++;
            }
        }
    }
    $processed++;
    if ($processed % 100 === 0)
        echo "Processed $processed/$total...\n";
}

echo "\nBackfill complete!\n";
echo "Total Payments Created: $created\n";
