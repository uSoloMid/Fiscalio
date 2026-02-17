<?php

namespace App\Console\Commands;

use App\Models\SatRequest;
use App\Services\SatDescargaMasivaService;
use App\Services\XmlProcessorService;
use Exception;
use Illuminate\Console\Command;
use PhpCfdi\SatWsDescargaMasiva\Shared\DocumentStatus;
use Illuminate\Support\Facades\Storage;

class SatRunnerCommand extends Command
{
    protected $signature = 'sat:runner {--loop : Ejecutar en bucle infinito}';
    protected $description = 'Ejecuta el ciclo de vida de las solicitudes SAT (polling, descarga, extracción)';
    protected $satService;
    protected $xmlProcessor;

    public function handle()
    {
        $this->info("Iniciando SAT Runner... (VERSION FINALISIMA v2)");

        // DEBUG INFO
        $this->info("--- DEBUG START ---");
        $this->info("CWD: " . getcwd());
        $this->info("DB: " . config('database.connections.sqlite.database'));

        $logPath = storage_path('logs/laravel.log');
        if (file_exists($logPath)) {
            $this->info("Last 5 lines of laravel.log:");
            $lines = array_slice(file($logPath), -5);
            foreach ($lines as $line)
                $this->info(trim($line));
        }
        else {
            $this->info("Log file not found at $logPath");
        }

        $this->info("--- DEBUG END ---");

        do {
            $this->tick();
            if ($this->option('loop'))
                sleep(60);
        } while ($this->option('loop'));
        return 0;
    }

    protected function tick()
    {
        $requests = SatRequest::whereIn('state', ['created', 'polling', 'downloading'])
            ->where(function ($query) {
            $query->whereNull('next_retry_at')->orWhere('next_retry_at', '<=', now());
        })
            ->orderBy('created_at', 'asc')
            ->take(5)
            ->get();

        foreach ($requests as $req) {
            $this->processRequest($req);
        }
    }

    protected function processRequest(SatRequest $req)
    {
        $this->info("[Runner] Procesando Request {$req->id} (RFC: {$req->rfc}) - Estado: {$req->state}");
        try {
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
            $this->error("[Error] " . $e->getMessage());
            $req->next_retry_at = now()->addMinutes(1);
            $req->save();
        }
    }

    protected function stepCreate(SatRequest $req)
    {
        if ($req->request_id) {
            $req->state = 'polling';
            $req->save();
            return;
        }

        $requestId = $this->satService->createQuery(
            \DateTimeImmutable::createFromMutable($req->start_date),
            \DateTimeImmutable::createFromMutable($req->end_date),
            $req->type,
            'xml'
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
        $this->info("SAT Status: " . $status->getValue());

        if ($status->isFinished()) {
            $ids = $verify->getPackagesIds();
            if (count($ids) > 0) {
                $req->state = 'downloading';
                $this->info("¡Paquetes listos! IDs: " . implode(',', $ids));
            }
            else {
                $req->state = 'completed';
            }
            $req->save();
        }
        elseif ($status->isAccepted() || $status->isInProgress()) {
            $req->next_retry_at = now()->addMinutes(1);
            $req->save();
        }
        else {
            // Manejo simplificado de error/ rechazo
            $req->state = 'failed';
            $req->save();
        }
    }

    protected function stepDownload(SatRequest $req)
    {
        $verify = $this->satService->verifyQuery($req->request_id);
        $packageIds = $verify->getPackagesIds();

        foreach ($packageIds as $packageId) {
            $path = "sat/downloads/" . $req->rfc . "/{$req->request_id}/$packageId.zip";

            // Descargar solo si no existe
            if (!Storage::exists($path)) {
                $this->info("Descargando paquete $packageId...");
                $this->satService->downloadPackage($req->request_id, $packageId, $path);
            }

            // EXTRAER MANUALMENTE CON UNZIP (EL PARCHE)
            $zipFullPath = Storage::path($path);
            $extractPath = dirname($zipFullPath) . '/extracted_' . $packageId;

            if (!file_exists($extractPath))
                mkdir($extractPath, 0777, true);

            $this->info("Descomprimiendo en: $extractPath");
            $zip = new \ZipArchive();
            $opened = $zip->open($zipFullPath);

            if ($opened === TRUE) {
                if (!file_exists($extractPath))
                    mkdir($extractPath, 0777, true);
                $zip->extractTo($extractPath);
                $zip->close();
                $files = scandir($extractPath);
                $this->info("¡ÉXITO! Paquete descomprimido con ZipArchive. Archivos: " . count($files));
            }
            else {
                $this->warn("ZipArchive falló (Código $opened). Intentando fallback...");
                if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                    $cmd = "powershell -command \"Expand-Archive -Path '$zipFullPath' -DestinationPath '$extractPath' -Force\"";
                    exec($cmd, $output, $returnCode);
                    if ($returnCode === 0) {
                        $this->info("¡ÉXITO! Paquete descomprimido con PowerShell.");
                    }
                    else {
                        $this->error("Fallo total en extracción. PowerShell return: $returnCode");
                    }
                }
                else {
                    $cmd = "unzip -o \"$zipFullPath\" -d \"$extractPath\"";
                    exec($cmd, $output, $returnCode);
                    if ($returnCode === 0) {
                        $this->info("¡ÉXITO! Paquete descomprimido con UNZIP.");
                    }
                    else {
                        $this->error("Fallo total en extracción. UNZIP return: $returnCode");
                    }
                }
            }

        }

        // Ahora dejamos que el procesador original intente leer (o falle, pero ya sabremos que descomprimió)
        // Llamamos al método original de extracción
        $this->stepExtract($req, $packageIds);
    }

    protected function stepExtract(SatRequest $req, array $packages)
    {
        $this->info("Iniciando extracción STANDARD...");

        foreach ($packages as $packageId) {
            $path = "sat/downloads/" . $req->rfc . "/{$req->request_id}/$packageId.zip";
            // El servicio XmlProcessorService intentará leer.
            // Si falla, al menos ya vimos arriba que el UNZIP funcionó.
            $this->xmlProcessor->processPackage($path, $req->rfc, $req->request_id);
        }

        $req->refresh();
        if ($req->state !== 'completed') {
            $req->state = 'completed';
            $req->save();
        }

        $this->info("Procesamiento finalizado. Total XMLs en BD: {$req->xml_count}");
    }
}
