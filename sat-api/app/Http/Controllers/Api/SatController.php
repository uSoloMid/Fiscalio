<?php

declare(strict_types = 1)
;

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PhpCfdi\Credentials\Certificate;
use PhpCfdi\Credentials\Key;
use PhpCfdi\Credentials\Credential;
use PhpCfdi\SatWsDescargaMasiva\Service;
use PhpCfdi\SatWsDescargaMasiva\Shared\DateTimePeriod;
use PhpCfdi\SatWsDescargaMasiva\Shared\ServiceEndpoints;
use PhpCfdi\SatWsDescargaMasiva\Services\Query\QueryParameters;
use PhpCfdi\SatWsDescargaMasiva\WebClient\GuzzleWebClient;
use PhpCfdi\SatWsDescargaMasiva\RequestBuilder\FielRequestBuilder\FielRequestBuilder;

class SatController extends Controller
{
    private function getService(Request $request): Service
    {
        // For simplicity, we are loading keys from a secrets path or request
        // In a real scenario, these should be handled more securely
        $contentCert = $request->input('content_cert');
        $contentKey = $request->input('content_key');
        $password = $request->input('password');

        if (!$contentCert || !$contentKey || !$password) {
            // Fallback to local secrets if not provided in request
            $contentCert = file_get_contents('/var/www/secrets/fiel.cer');
            $contentKey = file_get_contents('/var/www/secrets/fiel.key');
            $password = trim(file_get_contents('/var/www/secrets/password.txt'));
        }

        $certificate = new Certificate($contentCert);
        $privateKey = new Key($contentKey, $password);
        $fiel = new Credential($certificate, $privateKey);

        $webClient = new GuzzleWebClient();
        $requestBuilder = new FielRequestBuilder($fiel);

        return new Service($requestBuilder, $webClient, null, ServiceEndpoints::cfdi());
    }

    public function query(Request $request): JsonResponse
    {
        try {
            $service = $this->getService($request);

            $start = $request->input('start'); // 'Y-m-d H:i:s'
            $end = $request->input('end'); // 'Y-m-d H:i:s'
            $requestType = $request->input('type', 'cfdi'); // 'cfdi' or 'metadata'

            $period = DateTimePeriod::createFromValues($start, $end);

            // Determine request type logic if needed (library defaults to emitted/received via specific methods)
            // For now assuming 'received' packages for simplicity or making it configurable
            // The library defines query parameters specifically.

            // Simplified query for received documents
            $queryParameters = QueryParameters::create($period);
            $query = $service->query($queryParameters);

            if (!$query->getStatus()->isAccepted()) {
                return new JsonResponse([
                    'success' => false,
                    'message' => $query->getStatus()->getMessage(),
                    'code' => $query->getStatus()->getCode()
                ], 400);
            }

            return new JsonResponse([
                'success' => true,
                'requestId' => $query->getRequestId(),
                'status' => $query->getStatus()->getMessage()
            ]);

        }
        catch (\Throwable $e) {
            return new JsonResponse(['error' => $e->getMessage()], 500);
        }
    }

    public function verify(Request $request, string $requestId): JsonResponse
    {
        try {
            $service = $this->getService($request);
            $verify = $service->verify($requestId);

            return new JsonResponse([
                'success' => true,
                'status' => $verify->getStatus()->getCode(), // 1=Accepted, 2=In Progress, 3=Finished, 4=Failure, 5=Rejected
                'message' => $verify->getStatus()->getMessage(),
                'code_request' => $verify->getCodeRequest()->getValue(),
                'number_cfdis' => $verify->getNumberCfdis(),
                'packages' => $verify->getPackageIds(),
            ]);

        }
        catch (\Throwable $e) {
            return new JsonResponse(['error' => $e->getMessage()], 500);
        }
    }

    public function download(Request $request, string $packageId): JsonResponse
    {
        try {
            $service = $this->getService($request);
            $download = $service->download($packageId);

            if (!$download->getStatus()->isAccepted()) {
                return new JsonResponse([
                    'success' => false,
                    'message' => $download->getStatus()->getMessage()
                ], 400);
            }

            // Return base64 content
            return new JsonResponse([
                'success' => true,
                'packageId' => $packageId,
                'content' => base64_encode($download->getPackageContent()),
            ]);

        }
        catch (\Throwable $e) {
            return new JsonResponse(['error' => $e->getMessage()], 500);
        }
    }
}
