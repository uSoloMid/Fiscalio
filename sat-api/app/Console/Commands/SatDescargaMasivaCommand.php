<?php

namespace App\Console\Commands;

use App\Services\SatDescargaMasivaService;
use DateTimeImmutable;
use Illuminate\Console\Command;
use PhpCfdi\SatWsDescargaMasiva\Shared\DocumentStatus;

class SatDescargaMasivaCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:dm {action : La acción a realizar (solicitar, verificar, descargar)} 
                                   {rfc : El RFC del contribuyente}
                                   {--start= : Fecha de inicio (Y-m-d H:i:s) para solicitar}
                                   {--end= : Fecha de fin (Y-m-d H:i:s) para solicitar}
                                   {--requestId= : ID de la solicitud para verificar/descargar}
                                   {--type=issued : Tipo de descarga (issued|received)}
                                   {--requestType=xml : Tipo de solicitud (xml|metadata)}
                                   {--status=undefined : Estatus del documento (undefined|active|cancelled)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Interactuar con el WebService de Descarga Masiva del SAT';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $action = $this->argument('action');
        $rfc = $this->argument('rfc');

        try {
            $service = new SatDescargaMasivaService($rfc);

            switch ($action) {
                case 'solicitar':
                    return $this->handleSolicitar($service);
                case 'verificar':
                    return $this->handleVerificar($service);
                case 'descargar':
                    return $this->handleDescargar($service);
                default:
                    $this->error("Acción desconocida: $action");
                    return 1;
            }
        }
        catch (\Exception $e) {
            $this->error("Error: " . $e->getMessage());
            return 1;
        }
    }

    protected function handleSolicitar(SatDescargaMasivaService $service)
    {
        $start = $this->option('start');
        $end = $this->option('end');

        if (!$start || !$end) {
            $this->error("Las opciones --start y --end son requeridas para solicitar.");
            return 1;
        }

        $startDate = new DateTimeImmutable($start);
        $endDate = new DateTimeImmutable($end);

        $this->info("Solicitando descarga para " . $startDate->format('Y-m-d H:i:s') . " a " . $endDate->format('Y-m-d H:i:s') . "...");

        $requestId = $service->createQuery(
            $startDate,
            $endDate,
            $this->option('type'),
            $this->option('requestType'),
            $this->option('status')
        );

        $this->info("Solicitud creada con éxito. Request ID: $requestId");
        return 0;
    }

    protected function handleVerificar(SatDescargaMasivaService $service)
    {
        $requestId = $this->option('requestId');
        if (!$requestId) {
            $this->error("La opción --requestId es requerida para verificar.");
            return 1;
        }

        $this->info("Verificando solicitud $requestId...");
        $verify = $service->verifyQuery($requestId);

        $statusRequest = $verify->getStatusRequest();
        $codeRequest = $verify->getCodeRequest();

        $this->table(
        ['Estado', 'Valor', 'Mensaje'],
        [
            ['Estatus Solicitud', $statusRequest->getValue(), $statusRequest->getMessage()],
            ['Código Solicitud', $codeRequest->getValue(), $codeRequest->getMessage()],
            ['Paquetes', $verify->countPackages(), implode(', ', $verify->getPackagesIds())]
        ]
        );

        if ($statusRequest->isFinished()) {
            $this->info("La solicitud está terminada.");
        }
        elseif ($statusRequest->isInProgress()) {
            $this->warn("La solicitud está en progreso.");
        }
        else {
            $this->error("La solicitud falló o fue rechazada.");
        }

        return 0;
    }

    protected function handleDescargar(SatDescargaMasivaService $service)
    {
        $requestId = $this->option('requestId');
        if (!$requestId) {
            $this->error("La opción --requestId es requerida para descargar.");
            return 1;
        }

        $this->info("Verificando para obtener paquetes...");
        $verify = $service->verifyQuery($requestId);

        if (!$verify->getStatusRequest()->isFinished()) {
            $this->error("La solicitud no está terminada. Estado actual: " . $verify->getStatusRequest()->getValue());
            return 1;
        }

        $packages = $verify->getPackagesIds();
        $this->info("Paquetes encontrados: " . count($packages));

        foreach ($packages as $packageId) {
            $this->info("Descargando paquete $packageId...");
            $path = "sat/downloads/" . $this->argument('rfc') . "/$requestId/$packageId.zip";
            $service->downloadPackage($requestId, $packageId, $path);
            $this->info("Paquete guardado en storage: $path");

            // Procesamiento automático
            $this->info("Iniciando procesamiento del paquete...");
            $this->call('sat:dm:procesar', [
                'rfc' => $this->argument('rfc'),
                'requestId' => $requestId,
            ]);
        }

        return 0;
    }
}
