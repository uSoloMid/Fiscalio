<?php

namespace App\Console\Commands;

use App\Services\XmlProcessorService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class SatProcesarPaquetesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:dm:procesar 
                            {rfc : El RFC del receptor}
                            {requestId : El ID del request}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Procesa los paquetes ZIP descargados, extrae XMLs e indexa en BD';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $rfc = $this->argument('rfc');
        $requestId = $this->argument('requestId');

        $this->info("Buscando paquetes para $rfc / $requestId...");

        // Buscar ZIPs en sat/downloads/{RFC}/{requestId}/*.zip
        $dir = "sat/downloads/$rfc/$requestId";
        $files = Storage::files($dir);
        $zips = array_filter($files, fn($f) => str_ends_with(strtolower($f), '.zip'));

        if (empty($zips)) {
            $this->error("No se encontraron archivos ZIP en $dir");
            return 1;
        }

        $processor = new XmlProcessorService();

        foreach ($zips as $zip) {
            $this->info("Procesando $zip...");
            $processor->processPackage($zip, $rfc, $requestId);
        }

        $this->info("Procesamiento finalizado.");
        return 0;
    }
}
