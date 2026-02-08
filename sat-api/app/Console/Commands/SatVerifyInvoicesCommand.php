<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Services\BusinessSyncService;
use Illuminate\Console\Command;

class SatVerifyInvoicesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:verify-past {--limit=100 : Cantidad de facturas a verificar por ejecución}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Verifica el estatus de facturas antiguas en segundo plano para detectar cancelaciones';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(BusinessSyncService $service)
    {
        $this->info("Iniciando verificación de facturas antiguas...");

        $limit = (int)$this->option('limit');
        $businesses = Business::all();

        foreach ($businesses as $business) {
            $this->info("Procesando negocio: {$business->rfc}");

            // Usamos el servicio existente pero con un límite controlado para background
            // El servicio verifyInvoices busca facturas 'Vigentes' que no se han actualizado en 24h
            $result = $service->verifyInvoices($business, [
                'pageSize' => $limit
            ]);

            $count = count($result['changes']);
            $this->info("- Verificadas: {$result['verified_now']}");
            $this->info("- Cambios detectados (cancelaciones): $count");

            foreach ($result['changes'] as $change) {
                $this->line("  [!] Factura {$change['uuid']} cambió de {$change['old_status']} a {$change['new_status']}");
            }
        }

        $this->info("Verificación finalizada.");
        return 0;
    }
}
