<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Cfdi;
use App\Services\XmlProcessorService;
use Illuminate\Support\Facades\Storage;

$processor = app(XmlProcessorService::class);
$count = 0;

Cfdi::chunk(100, function ($cfdis) use ($processor, &$count) {
    foreach ($cfdis as $cfdi) {
        try {
            if (!Storage::exists($cfdi->path_xml))
                continue;
            $data = $processor->parseCfdi(Storage::get($cfdi->path_xml));
            $cfdi->update([
                'traslados_locales' => $data['traslados_locales'] ?? 0,
                'retenciones_locales' => $data['retenciones_locales'] ?? 0
            ]);
            $count++;
        }
        catch (\Exception $e) {
            echo "Error UUID {$cfdi->uuid}: " . $e->getMessage() . "\n";
        }
    }
    echo "Procesados $count...\n";
});

echo "Finalizado. Total actualizado: $count\n";
