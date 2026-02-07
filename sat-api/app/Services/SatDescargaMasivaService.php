<?php

namespace App\Services;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Exception;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use PhpCfdi\SatWsDescargaMasiva\RequestBuilder\FielRequestBuilder\Fiel;
use PhpCfdi\SatWsDescargaMasiva\RequestBuilder\FielRequestBuilder\FielRequestBuilder;
use PhpCfdi\SatWsDescargaMasiva\Service;
use PhpCfdi\SatWsDescargaMasiva\Services\Query\QueryParameters;
use PhpCfdi\SatWsDescargaMasiva\Shared\DateTimePeriod;
use PhpCfdi\SatWsDescargaMasiva\Shared\DocumentStatus;
use PhpCfdi\SatWsDescargaMasiva\Shared\DownloadType;
use PhpCfdi\SatWsDescargaMasiva\Shared\RequestType;
use PhpCfdi\SatWsDescargaMasiva\WebClient\GuzzleWebClient;
use RuntimeException;
use Throwable;

class SatDescargaMasivaService
{
    protected $service;
    protected $rfc;

    public function __construct(string $rfc)
    {
        $this->rfc = $rfc;
        $this->service = $this->makeService($rfc);
    }

    protected function makeService(string $rfc): Service
    {
        $files = $this->readClientFiles($rfc);
        $fiel = Fiel::create($files['cer'], $files['key'], $files['pass']);

        if (!$fiel->isValid()) {
            throw new RuntimeException("La e.firma no es válida/vigente o es CSD (RFC $rfc).");
        }

        // SSL verify (CA bundle) - Usamos el default del sistema o se puede configurar
        // En producción en servidores linux usualmente no se necesita especificar el CA bundle si está bien configurado
        // Para desarrollo en windows a veces sí.
        $verify = true;
        // Si se requiere un cacert específico, se puede configurar aquí.

        $guzzle = new GuzzleClient([
            'timeout' => 60,
            'connect_timeout' => 20,
            'http_errors' => true,
            'verify' => $verify,
        ]);

        $webClient = new GuzzleWebClient($guzzle);
        $requestBuilder = new FielRequestBuilder($fiel);

        return new Service($requestBuilder, $webClient);
    }

    protected function readClientFiles(string $rfc): array
    {
        // First try to load from the Business model
        $business = \App\Models\Business::where('rfc', strtoupper($rfc))->first();

        if ($business && $business->certificate && $business->private_key && $business->passphrase) {
            // Check if they look like base64 and might need decoding
            $cer = $business->certificate;
            $key = $business->private_key;

            // Basic heuristic: if it doesn't contain the PEM headers and resembles base64, it might be raw base64
            if (!str_contains($cer, '-----BEGIN CERTIFICATE-----') && base64_decode($cer, true)) {
                $cer = base64_decode($cer);
            }
            if (!str_contains($key, '-----BEGIN') && base64_decode($key, true)) {
                $key = base64_decode($key);
            }

            return [
                'cer' => $cer,
                'key' => $key,
                'pass' => $business->passphrase,
            ];
        }

        // Fallback to filesystem if not in DB
        $basePath = config('sat.clients_path', 'sat/clients');
        $path = $basePath . '/' . strtoupper($rfc);

        if (!Storage::exists("$path/certificado.cer") || !Storage::exists("$path/llave.key") || !Storage::exists("$path/password.txt")) {
            throw new RuntimeException("Faltan archivos de la FIEL para el RFC $rfc. No se encuentran en base de datos ni en " . Storage::path($path));
        }

        return [
            'cer' => Storage::get("$path/certificado.cer"),
            'key' => Storage::get("$path/llave.key"),
            'pass' => rtrim(Storage::get("$path/password.txt"), "\r\n"),
        ];
    }

    public function createQuery(DateTimeImmutable $start, DateTimeImmutable $end, string $downloadType = 'issued', string $requestType = 'xml', string $status = 'undefined')
    {
        [$start, $end] = $this->normalizePeriod($start, $end);

        $qp = QueryParameters::create()
            ->withPeriod(DateTimePeriod::createFromValues(
            $start->format('Y-m-d H:i:s'),
            $end->format('Y-m-d H:i:s')
        ))
            ->withDownloadType($downloadType === 'received' ?DownloadType::received() : DownloadType::issued())
            ->withRequestType($requestType === 'metadata' ?RequestType::metadata() : RequestType::xml());

        if ($status === 'active')
            $qp = $qp->withDocumentStatus(DocumentStatus::active());
        if ($status === 'cancelled')
            $qp = $qp->withDocumentStatus(DocumentStatus::cancelled());

        // Ajuste automático para Recibidos + XML (solo vigentes)
        if ($downloadType === 'received' && $requestType === 'xml' && $status !== 'active') {
            $qp = $qp->withDocumentStatus(DocumentStatus::active());
            Log::warning("Ajuste automático: Recibidos + XML forzado a Vigentes para RFC $this->rfc");
        }

        $query = $this->withSatRetry(function () use ($qp) {
            return $this->service->query($qp);
        }, [
            'action' => 'create',
            'rfc' => $this->rfc,
            'downloadType' => $downloadType,
            'requestType' => $requestType
        ]);

        if (!$query->getStatus()->isAccepted()) {
            throw new RuntimeException("Fallo al presentar consulta: " . $query->getStatus()->getMessage());
        }

        return $query->getRequestId();
    }

    public function verifyQuery(string $requestId)
    {
        $verify = $this->withSatRetry(function () use ($requestId) {
            return $this->service->verify($requestId);
        }, [
            'action' => 'verify',
            'rfc' => $this->rfc,
            'requestId' => $requestId,
        ]);

        if (!$verify->getStatus()->isAccepted()) {
            throw new RuntimeException("Fallo al verificar: " . $verify->getStatus()->getMessage());
        }
        if (!$verify->getCodeRequest()->isAccepted()) {
            throw new RuntimeException("Solicitud rechazada: " . $verify->getCodeRequest()->getMessage());
        }

        return $verify;
    }

    public function downloadPackage(string $requestId, string $packageId, string $destinationPath): void
    {
        $download = $this->withSatRetry(function () use ($packageId) {
            return $this->service->download($packageId);
        }, [
            'action' => 'download',
            'rfc' => $this->rfc,
            'requestId' => $requestId,
            'packageId' => $packageId,
        ]);

        if (!$download->getStatus()->isAccepted()) {
            throw new RuntimeException("No pude descargar paq $packageId: " . $download->getStatus()->getMessage());
        }

        Storage::put($destinationPath, $download->getPackageContent());
    }

    protected function normalizePeriod(DateTimeImmutable $start, DateTimeImmutable $end): array
    {
        if ($end <= $start)
            $end = $start->modify('+2 seconds');
        $diff = $end->getTimestamp() - $start->getTimestamp();
        if ($diff < 2)
            $end = $start->modify('+2 seconds');
        return [$start, $end];
    }

    protected function withSatRetry(callable $fn, array $context, int $retries = 2, int $sleepMs = 600)
    {
        $attempt = 0;
        while (true) {
            try {
                $attempt++;
                return $fn();
            }
            catch (Throwable $e) {
                $msg = $e->getMessage();
                $is500 = (stripos($msg, ' 500') !== false) || (stripos($msg, 'status code 500') !== false);

                Log::error('SAT WS exception', [
                    'attempt' => $attempt,
                    'is500' => $is500,
                    'exception' => get_class($e),
                    'message' => $msg,
                    'context' => $context,
                ]);

                if (!$is500 || $attempt > $retries + 1) {
                    throw $e;
                }

                usleep($sleepMs * 1000);
                $sleepMs *= 2;
            }
        }
    }
}
