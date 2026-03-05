<?php

namespace App\Services;

use PhpCfdi\SatEstadoCfdi\Consumer;
use PhpCfdi\SatEstadoCfdi\Clients\Http\HttpConsumerClient;
use PhpCfdi\SatEstadoCfdi\Clients\Http\HttpConsumerFactory;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Psr7\HttpFactory;

class SatStatusService
{
    protected $consumer;

    public function __construct()
    {
        $guzzleClient = new GuzzleClient([
            'timeout' => 15,
            'verify' => false, // Ojo en prod, para pruebas locales/certificados SAT suele ser necesario
        ]);

        $guzzleFactory = new HttpFactory();

        $factory = new HttpConsumerFactory($guzzleClient, $guzzleFactory, $guzzleFactory);
        $client = new HttpConsumerClient($factory);
        $this->consumer = new Consumer($client);
    }

    public function checkStatus(string $uuid, string $rfcEmisor, string $rfcReceptor, string $total): array
    {
        // SAT requires total in same format as cfdi-expresiones FormatTotal18x6:
        // 6 decimal places, trailing zeros stripped, minimum 1 decimal.
        // e.g. "1500.00" → "1500.0", "1500.54" → "1500.54", "1500.50" → "1500.5"
        $tt = rtrim(number_format(floatval($total), 6, '.', ''), '0');
        if (str_ends_with($tt, '.')) {
            $tt .= '0';
        }
        $expression = sprintf("?re=%s&rr=%s&tt=%s&id=%s", $rfcEmisor, $rfcReceptor, $tt, $uuid);
        return $this->checkStatusByExpression($expression);
    }

    /**
     * Query SAT status using a pre-built expression (preferred — avoids total format mismatches).
     * Use DiscoverExtractor on the original XML to get the exact expression the SAT expects.
     */
    public function checkStatusByExpression(string $expression): array
    {
        try {
            $response = $this->consumer->execute($expression);

            return [
                'codigo_estatus' => $response->query->name,
                'estado' => $this->mapDocumentStatus($response->document->name),
                'es_cancelable' => $response->cancellable->name,
                'estatus_cancelacion' => $response->cancellation->name,
                'validacion_efos' => $response->efos->name,
                'raw_status' => $response->document->name,
            ];
        } catch (\Exception $e) {
            return [
                'estado' => 'Error',
                'codigo_estatus' => 'Error',
                'es_cancelable' => '',
                'estatus_cancelacion' => '',
                'validacion_efos' => '',
                'raw_error' => $e->getMessage()
            ];
        }
    }

    protected function mapDocumentStatus(string $status): string
    {
        // Mapear los estados de la librería a los que espera nuestra app
        // La librería usa 'Active', 'Cancelled', 'NotFound'
        // Nuestra app parece usar 'Vigente', 'Cancelado', 'No Encontrado'

        switch ($status) {
            case 'Active':
                return 'Vigente';
            case 'Cancelled':
                return 'Cancelado';
            default:
                return 'No Encontrado';
        }
    }
}
