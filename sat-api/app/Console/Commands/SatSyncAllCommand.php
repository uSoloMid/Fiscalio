<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Services\BusinessSyncService;
use Illuminate\Console\Command;

class SatSyncAllCommand extends Command
{
    protected $signature = 'sat:sync-all';
    protected $description = 'Dispara el proceso de sincronización para todos los contribuyentes activos (respeta el umbral de 12h)';

    public function handle(BusinessSyncService $service)
    {
        $businesses = Business::all();
        $this->info("Iniciando revisión de sincronización para " . $businesses->count() . " contribuyentes...");

        foreach ($businesses as $business) {
            $result = $service->syncIfNeeded($business);

            if ($result['status'] === 'success') {
                $this->info("[{$business->rfc}] Sincronización encolada: {$result['requests_created']} nuevas solicitudes.");
            }
            elseif ($result['status'] === 'too_recent') {
                $this->line("[{$business->rfc}] Omitido: Sincronización reciente ({$result['last_sync']}).");
            }
            else {
                $this->line("[{$business->rfc}] Estado: {$result['status']}");
            }
        }

        $this->info("Proceso terminado.");
        return 0;
    }
}
