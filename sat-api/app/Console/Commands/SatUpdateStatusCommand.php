<?php

namespace App\Console\Commands;

use App\Models\Cfdi;
use App\Services\SatStatusService;
use Illuminate\Console\Command;

class SatUpdateStatusCommand extends Command
{
    protected $signature = 'sat:cfdi:update-status {--limit=200}';
    protected $description = 'Actualiza el estado SAT de los CFDIs registrados';

    public function handle()
    {
        $limit = $this->option('limit');
        $service = new SatStatusService();

        // Seleccionar CFDIs con estado NULL o antiguos (> 7 días)
        $cfdis = Cfdi::whereNull('estado_sat')
            ->orWhere('estado_sat_updated_at', '<', now()->subDays(7))
            ->orderBy('estado_sat_updated_at', 'asc') // Priorizar mas viejos
            ->limit($limit)
            ->get();

        $this->info("Encontrados " . $cfdis->count() . " CFDIs para actualizar.");

        $bar = $this->output->createProgressBar($cfdis->count());
        $bar->start();

        foreach ($cfdis as $cfdi) {
            // Rate limit manual
            usleep(500 * 1000); // 500ms

            // Formatear total con decimales correctos si es necesario
            // number_format($cfdi->total, 2, '.', '')? A veces el SAT pide exactitid.
            // stored total is decimal(18,2)

            $result = $service->checkStatus(
                $cfdi->uuid,
                $cfdi->rfc_emisor,
                $cfdi->rfc_receptor,
                number_format($cfdi->total, 2, '.', '') // Force 2 decimals? Depends on XML. Usually safe.
            );

            if ($result['estado'] === 'Error') {
            // Log error but continue
            // $this->error("Error checking {$cfdi->uuid}: " . $result['raw_error']);
            }
            else {
                $cfdi->estado_sat = $result['estado'];
                $cfdi->estado_sat_updated_at = now();

                if ($result['estado'] === 'Cancelado') {
                    $cfdi->es_cancelado = 1;
                // No tenemos fecha de cancelacion exacta en el servicio publico simple, 
                // a veces viene en otro campo o requiere auth. 
                // Asumimos now() si cambia de vigente a cancelado, o null si no sabemos.
                }
                else {
                    $cfdi->es_cancelado = 0;
                }

                $cfdi->save();
            }

            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info("Proceso terminado.");

        return 0;
    }
}
