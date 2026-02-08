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
        // El SAT requiere que el total sea un string formateado con el número de decimales que tiene el CFDI
        // pero la expresión estándar suele usar el total tal cual. 
        // Generamos la expresión (id=UUID&re=RFC_EMISOR&rr=RFC_RECEPTOR&tt=TOTAL&fe=ULTIMOS_8_CARACTERES_SELLO)
        // Pero la librería phpcfdi/sat-estado-cfdi prefiere la expresión completa o los parámetros.

        // Usaremos la expresión básica: ?re=...&rr=...&tt=...&id=...
        $expression = sprintf("?re=%s&rr=%s&tt=%s&id=%s", $rfcEmisor, $rfcReceptor, $total, $uuid);

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

        }
        catch (\Exception $e) {
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
