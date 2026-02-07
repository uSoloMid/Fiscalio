<?php

namespace App\Services;

use GuzzleHttp\Client;
use DOMDocument;

class SatStatusService
{
    protected $client;
    protected $url = 'https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc';

    public function __construct()
    {
        $this->client = new Client([
            'timeout' => 10,
            'verify' => false, // Ojo en prod
        ]);
    }

    public function checkStatus(string $uuid, string $rfcEmisor, string $rfcReceptor, string $total): array
    {
        $soapBody = $this->buildSoapEnvelope($uuid, $rfcEmisor, $rfcReceptor, $total);

        try {
            $response = $this->client->post($this->url, [
                'headers' => [
                    'Content-Type' => 'text/xml; charset=utf-8',
                    'SOAPAction' => 'http://tempuri.org/IConsultaCFDIService/Consulta',
                    'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
                ],
                'body' => $soapBody
            ]);

            return $this->parseResponse($response->getBody()->getContents());

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

    protected function buildSoapEnvelope($uuid, $re, $rr, $tt)
    {
        // Formatear total a 6 decimales a veces ayuda, o standard
        // El formato exigido suele ser ?re=...&rr=...&tt=...&id=...

        // Ajuste de total: debe ser string con formato. El SAT a veces es quisquilloso.
        // Usaremos el valor directo si viene bien, o number_format.
        // El servicio espera una cadena: ?re=...

        $expression = sprintf("?re=%s&rr=%s&tt=%s&id=%s", $re, $rr, $tt, $uuid);
        $expression = htmlspecialchars($expression);

        return <<<XML
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:Consulta>
         <tem:expresionImpresa><![CDATA[$expression]]></tem:expresionImpresa>
      </tem:Consulta>
   </soapenv:Body>
</soapenv:Envelope>
XML;
    }

    protected function parseResponse($xmlString)
    {
        $dom = new DOMDocument();
        @$dom->loadXML($xmlString);

        $xpath = new \DOMXPath($dom);
        $xpath->registerNamespace('s', 'http://schemas.xmlsoap.org/soap/envelope/');
        $xpath->registerNamespace('tem', 'http://tempuri.org/');
        $xpath->registerNamespace('a', 'http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio'); // Namespace variable a veces

        // Buscar nodo Resultado
        // A veces el namespace cambia o es default. Buscamos por nombre local.
        $codigoEstatus = $this->getNodeValue($dom, 'CodigoEstatus');
        $estado = $this->getNodeValue($dom, 'Estado');
        $esCancelable = $this->getNodeValue($dom, 'EsCancelable');
        $estatusCancelacion = $this->getNodeValue($dom, 'EstatusCancelacion');
        $validacionEfos = $this->getNodeValue($dom, 'ValidacionEFOS');

        return [
            'codigo_estatus' => $codigoEstatus,
            'estado' => $estado, // Vigente, Cancelado, No Encontrado
            'es_cancelable' => $esCancelable,
            'estatus_cancelacion' => $estatusCancelacion,
            'validacion_efos' => $validacionEfos,
        ];
    }

    protected function getNodeValue($dom, $tagName)
    {
        $list = $dom->getElementsByTagName($tagName);
        if ($list->length > 0) {
            return $list->item(0)->nodeValue;
        }
        return null;
    }
}
