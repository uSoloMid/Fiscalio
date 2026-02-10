<?php

namespace App\Console\Commands;

use App\Models\SatRequest;
use App\Services\SatDescargaMasivaService;
use App\Services\XmlProcessorService;
use Exception;
use Illuminate\Console\Command;
use PhpCfdi\SatWsDescargaMasiva\Shared\DocumentStatus;

class SatRunnerCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'sat:runner {--loop : Ejecutar en bucle infinito}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Ejecuta el ciclo de vida de las solicitudes SAT (polling, descarga, extracción)';

    protected $satService;
    protected $xmlProcessor;

    public function handle()
    {
        $this->info("Iniciando SAT Runner...");

        // Loop simple si se pide --loop
        do {
            $this->tick();
            if ($this->option('loop')) {
                sleep(60); // Polling cada 60s
            }
        } while ($this->option('loop'));

        return 0;
    }

    protected function tick()
    {
        // 1. Contar solicitudes activas (que ya están hablando con el SAT)
        $activeCount = SatRequest::whereIn('state', ['polling', 'downloading'])->count();

        // 2. Contar solicitudes totales pendientes
        $totalPending = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])->count();

        // Estrategia de escalonamiento: 
        // Si hay muchas solicitudes (>10), procesamos lotes más pequeños para no saturar.
        $batchSize = 5;
        $delayBetweenRequests = 0;

        if ($totalPending > 10) {
            $batchSize = 2; // Reducir concurrencia
            $delayBetweenRequests = 5; // Esperar 5 segundos entre cada una en el mismo lote
        }

        $requests = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])
            ->where(function ($query) {
            $query->whereNull('next_retry_at')
                ->orWhere('next_retry_at', '<=', now());
        })
            ->orderBy('created_at', 'asc')
            ->take($batchSize)
            ->get();

        if ($requests->isEmpty()) {
            return;
        }

        foreach ($requests as $index => $req) {
            if ($index > 0 && $delayBetweenRequests > 0) {
                $this->info("Encadenando: esperando {$delayBetweenRequests}s para escalonar...");
                sleep($delayBetweenRequests);
            }
            $this->processRequest($req);
        }
    }

    protected function processRequest(SatRequest $req)
    {
        $this->info("[Runner] Procesando Request {$req->id} (RFC: {$req->rfc}) - Estado: {$req->state}");

        try {
            // Instanciar servicio SAT con el RFC del request
            $this->satService = new SatDescargaMasivaService($req->rfc);
            $this->xmlProcessor = new XmlProcessorService();

            switch ($req->state) {
                case 'created':
                    $this->stepCreate($req);
                    break;
                case 'polling':
                    $this->stepPoll($req);
                    break;
                case 'downloading':
                    $this->stepDownload($req);
                    break;
            }

        }
        catch (Exception $e) {
            $this->handleError($req, $e);
        }
    }

    protected function stepCreate(SatRequest $req)
    {
        // Si ya tiene request_id, avanzar a polling (recuperación de error)
        if ($req->request_id) {
            $req->state = 'polling';
            $req->save();
            return;
        }

        $requestId = $this->satService->createQuery(
            \DateTimeImmutable::createFromMutable($req->start_date),
            \DateTimeImmutable::createFromMutable($req->end_date),
            $req->type, // issued/received
            'xml' // Asumimos XML por ahora
        );

        $req->request_id = $requestId;
        $req->state = 'polling';
        $req->save();

        $this->info("Solicitud creada en SAT: $requestId");
    }

    protected function stepPoll(SatRequest $req)
    {
        $verify = $this->satService->verifyQuery($req->request_id);
        $status = $verify->getStatusRequest();
        $code = $verify->getCodeRequest();

        $req->sat_status = $status->getValue();
        $packageIds = $verify->getPackagesIds();
        $req->package_count = count($packageIds);
        $req->save();

        if ($status->isFinished()) {
            if ($req->package_count > 0) {
                $req->state = 'downloading';
                $this->info("Solicitud terminada con paquetes. Pasando a descarga.");
            }
            else {
                $req->state = 'completed'; // Terminada sin paquetes (vacía)
                $this->info("Solicitud terminada sin paquetes.");
            }
            $req->save();
        }
        elseif ($status->isAccepted() || $status->isInProgress()) {
            // Backoff
            $this->scheduleRetry($req, "En proceso (SAT Status: " . $status->getValue() . ")");
        }
        else {
            // Check if it's a "No info" rejection or failure
            $message = $status->getMessage();
            $msgLower = mb_strtolower($message);

            if (str_contains($msgLower, 'no se encontró la información') ||
            str_contains($msgLower, 'no generó paquetes') ||
            str_contains($msgLower, 'falta de información')) {

                $req->state = 'completed';
                $req->save();
                $this->info("Solicitud finalizada: El SAT indica que no hay facturas para este periodo/rango.");
                return;
            }

            // Fallo/Rechazada real
            throw new Exception("Solicitud rechazada/fallida: " . $message);
        }
    }

    protected function stepDownload(SatRequest $req)
    {
        $verify = $this->satService->verifyQuery($req->request_id);
        $packages = $verify->getPackagesIds();

        foreach ($packages as $packageId) {
            $path = "sat/downloads/" . $req->rfc . "/{$req->request_id}/$packageId.zip";
            // Descargar si no existe
            if (!\Illuminate\Support\Facades\Storage::exists($path)) {
                $this->satService->downloadPackage($req->request_id, $packageId, $path);
                $this->info("Paquete $packageId descargado.");
            }
        }

        $req->state = 'extracting';
        $req->save();

        // Trigger inmediato de extracción
        $this->stepExtract($req, $packages);
    }

    protected function stepExtract(SatRequest $req, array $packages)
    {
        $this->info("Iniciando extracción...");

        // Buscar ZIPs descargados
        // Nota: XmlProcessorService procesa TODO el directorio del request
        // Así que podemos pasar cualquiera de los ZIPs o iterar.
        // Pero XmlProcessorService ya itera internally si le damos el path a un zip? 
        // Revisando XmlProcessorService: recibe un zipPath único.

        $processedCount = 0;
        foreach ($packages as $packageId) {
            $path = "sat/downloads/" . $req->rfc . "/{$req->request_id}/$packageId.zip";
            $this->xmlProcessor->processPackage($path, $req->rfc, $req->request_id);
        }

        // XmlProcessor actualiza xml_count y state=completed automáticamente
        // Recargamos modelo
        $req->refresh();
        if ($req->state !== 'completed') {
            $req->state = 'completed';
            $req->save();
        }

        $this->info("Procesamiento finalizado. Total XMLs: {$req->xml_count}");
    }

    protected function handleError(SatRequest $req, Exception $e)
    {
        $this->error("[Error] " . $e->getMessage());
        $req->attempts++;
        $req->last_error = $e->getMessage();

        if ($req->attempts >= 30) {
            $req->state = 'failed';
            $req->next_retry_at = null;
            $this->error("Max intentos alcanzados. Marcado como failed.");
        }
        else {
            $this->scheduleRetry($req, $e->getMessage());
        }
        $req->save();
    }

    protected function scheduleRetry(SatRequest $req, $reason)
    {
        $minutes = 1;
        if ($req->attempts > 5)
            $minutes = 5;
        if ($req->attempts > 15)
            $minutes = 15;

        $req->next_retry_at = now()->addMinutes($minutes);
        $this->info("Reintento programado en $minutes min. Razón: $reason");
        $req->save();
    }
}
