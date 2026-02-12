<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class SatRunJobsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:run-jobs 
                            {--limit=200 : Cantidad de facturas a verificar por ejecución} 
                            {--sync-only : Solo ejecuta la sincronización masiva}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Orquestador de tareas del SAT para ejecución serial (evita bloqueos de base de datos)';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $this->info("=== Iniciando Orquestador de Tareas SAT ===");
        $start = microtime(true);

        // 1. Ejecutar sincronización masiva (SatSyncAllCommand)
        $this->info(">>> Paso 1/2: Sincronización Masiva");
        $syncExitCode = $this->call('sat:sync-all');

        if ($syncExitCode !== 0) {
            $this->error("Error: 'sat:sync-all' terminó con código {$syncExitCode}. Se abortan tareas posteriores.");
            return $syncExitCode;
        }

        if ($this->option('sync-only')) {
            $this->info("Sincronización finalizada satisfactoriamente (modo sync-only).");
            return 0;
        }

        $this->newLine();

        // 2. Ejecutar verificación de facturas antiguas (SatVerifyInvoicesCommand)
        $limit = (int)$this->option('limit');
        $this->info(">>> Paso 2/2: Verificación de Facturas Antiguas (Límite: {$limit})");
        $verifyExitCode = $this->call('sat:verify-past', [
            '--limit' => $limit
        ]);

        if ($verifyExitCode !== 0) {
            $this->warn("Aviso: 'sat:verify-past' terminó con código {$verifyExitCode}.");
        }

        $this->newLine();
        $duration = round(microtime(true) - $start, 2);
        $this->info("=== Orquestador finalizado en {$duration}s ===");

        return ($syncExitCode === 0 && $verifyExitCode === 0) ? 0 : 1;
    }
}
