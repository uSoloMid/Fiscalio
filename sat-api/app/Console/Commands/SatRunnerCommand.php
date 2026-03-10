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
        ini_set('memory_limit', '-1');
        $this->info("Iniciando SAT Runner... (VERSION FINALISIMA v2.1 - Memory Fix)");

        // DEBUG INFO
        $this->info("--- DEBUG START ---");
        $this->info("CWD: " . getcwd());
        $this->info("DB: " . config('database.default') . ' / ' . config('database.connections.' . config('database.default') . '.database'));

        $logPath = storage_path('logs/laravel.log');
        if (file_exists($logPath)) {
            $this->info("Last 5 lines of laravel.log:");
            // Usar tail para evitar cargar todo el archivo en memoria
            $lastLines = shell_exec("tail -n 5 " . escapeshellarg($logPath));
            $this->info($lastLines ?: "No log content or error reading log.");
        }
        else {
            $this->info("Log file not found at $logPath");
        }

        $this->info("--- DEBUG END ---");

        do {
            \Illuminate\Support\Facades\Storage::put('runner.heartbeat', now()->toDateTimeString());
            $this->tick();
            if ($this->option('loop')) {
                sleep(30);
            }
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
            ->take(10)
            ->get();

        foreach ($requests as $req) {
            $this->processRequest($req);
        }
    }

    protected function processRequest(SatRequest $req)
    {
        // Optimistic lock: atomically claim the record by incrementing attempts.
        // If another runner instance already incremented (concurrent execution), skip.
        $claimed = SatRequest::where('id', $req->id)
            ->where('attempts', $req->attempts ?? 0)
            ->whereIn('state', ['created', 'polling', 'downloading'])
            ->update(['attempts' => ($req->attempts ?? 0) + 1]);

        if (!$claimed) {
            $this->warn("[Skip] Request {$req->id} ya fue tomada por otro runner — se omite.");
            return;
        }

        $req->attempts = ($req->attempts ?? 0) + 1;

        $this->info("[Runner] Procesando Request {$req->id} (RFC: {$req->rfc}) - Estado: {$req->state}");
        try {

            // Si el password o certificado es inválido, fallamos de inmediato para no buclear
            try {
                $this->satService = new SatDescargaMasivaService($req->rfc);
            }
            catch (Exception $authError) {
                $authMsg = $authError->getMessage();
                if (str_contains($authMsg, 'Certificado') || str_contains($authMsg, 'firma') || str_contains($authMsg, 'key') || str_contains($authMsg, 'passphrase')) {
                    $req->state = 'failed';
                    $req->last_error = "Error de Credenciales: " . $authMsg;
                    $req->save();
                    $this->error("[Fatal] Error de autenticación para {$req->rfc}: " . $authMsg);
                    return;
                }
                throw $authError; // Re-throw to be caught by the outer block if it's another type of error
            }

            $this->xmlProcessor = new XmlProcessorService();

            $oldState = $req->state;
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

            // Reset error if successful step (unless it's already failed)
            if ($req->state !== 'failed') {
                $req->last_error = null;
            }

            // Only clear next_retry_at if state changed (moving to next step)
            // If state is the same (e.g. still polling), keep the retry timer set by the step
            if ($req->state !== $oldState) {
                $req->next_retry_at = null;
            }

            $req->save();

        }
        catch (Exception $e) {
            $msg = $e->getMessage();
            $this->error("[Error] " . $msg);
            $req->last_error = $msg;

            // Si el SAT rechaza porque no hay información, detenemos el proceso (se marca completado con 0 XMLs)
            if (str_contains($msg, 'Solicitud rechazada') || str_contains($msg, 'No se encontró la información') || str_contains($msg, 'vencida')) {
                $req->state = 'completed';
                $this->info("Marcando Request {$req->id} como completado (Sin información/Rechazada/Vencida por SAT).");
            }
            // "Solicitudes de por vida" es colisión de solicitudes duplicadas, no un límite real.
            // O "Error no controlado" persistente: resetear request_id y reintentar con ID fresco.
            elseif (str_contains($msg, 'solicitudes de por vida') || str_contains($msg, 'agotado') || (str_contains($msg, 'Error no controlado') && $req->attempts >= 1)) {

                // Si el error NO CONTROLADO persiste tras 15 intentos totales (incluyendo reintentos con IDs frescos),
                // entonces el RFC o el periodo probablemente tienen un bloqueo real en el portal SAT.
                if ($req->attempts >= 15 && str_contains($msg, 'Error no controlado')) {
                    $req->state = 'failed';
                    $req->last_error = "SAT persiste en Error no controlado (5005) tras múltiples gestiones: " . $msg;
                    $this->error("Máximo de intentos con SAT 5005 alcanzado para {$req->id}.");
                }
                else {
                    $req->state = 'created';
                    $req->request_id = null;
                    $req->last_error = null; // Limpiamos para que el usuario no vea el error "luego luego"
                    $req->next_retry_at = now()->addMinutes(5);
                    $this->warn("Error persistente (SAT 5005 o colisión) para {$req->id} — reintentando con ID fresco en 5 min.");
                }
            }
            else {
                // Si ya van muchos intentos, marcar como fallida para que no estorbe en la cola
                if ($req->attempts >= 5) {
                    $req->state = 'failed';
                    $this->error("Máximo de intentos (5) alcanzado para Request {$req->id}.");
                }
                else {
                    $req->next_retry_at = now()->addMinutes(2);
                }
            }

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
            $satStatus = $status->getValue();
            $satMsg = method_exists($status, 'getMessage') ? $status->getMessage() : '';
            throw new Exception("Fallo al verificar: {$satStatus} {$satMsg}");
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

        // Llamamos al método de extracción e indexación
        try {
            $this->stepExtract($req, $packageIds);
        }
        catch (Exception $e) {
            $req->last_error = "Error en extracción: " . $e->getMessage();
            $req->state = 'failed';
            $req->save();
            $this->error("[stepExtract] " . $e->getMessage());
        }
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
