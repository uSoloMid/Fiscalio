<?php

namespace App\Services;

use App\Models\Cfdi;
use App\Models\SatRequest;
use DateTimeImmutable;
use DOMDocument;
use Exception;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

class XmlProcessorService
{
    public function processPackage(string $zipPath, string $rfcCliente, string $requestId)
    {
        $rfcCliente = strtoupper($rfcCliente);
        $fullZipPath = Storage::path($zipPath);

        if (!file_exists($fullZipPath)) {
            Log::error("ZIP no encontrado: $fullZipPath");
            return;
        }

        // Directorio temporal
        $tmpDir = "sat/tmp/$requestId";
        Storage::makeDirectory($tmpDir);
        $fullTmpDir = Storage::path($tmpDir);

        // Descomprimir
        $zip = new ZipArchive;
        if ($zip->open($fullZipPath) === TRUE) {
            $zip->extractTo($fullTmpDir);
            $zip->close();
        }
        else {
            Log::error("No se pudo abrir el ZIP: $fullZipPath");
            return;
        }

        $xmlsProcesados = 0;
        $files = Storage::allFiles($tmpDir);

        foreach ($files as $file) {
            if (!str_ends_with(strtolower($file), '.xml')) {
                continue;
            }

            try {
                $content = Storage::get($file);
                $data = $this->parseCfdi($content);

                if (!$data) {
                    continue;
                }

                // Clasificar
                $tipo = 'otros';
                if (strtoupper($data['rfc_emisor']) === $rfcCliente) {
                    $tipo = 'emitidas';
                }
                elseif (strtoupper($data['rfc_receptor']) === $rfcCliente) {
                    $tipo = 'recibidas';
                }

                // Mover archivo final
                $year = $data['fecha']->format('Y');
                $month = $data['fecha']->format('m');
                $finalPath = "sat/xml/$rfcCliente/$year/$tipo/$month/" . $data['uuid'] . ".xml";

                Storage::put($finalPath, $content);

                // Indexar DB (Idempotencia)
                $this->indexCfdi($data, $finalPath, $requestId);

                $xmlsProcesados++;

            }
            catch (Exception $e) {
                Log::error("Error procesando XML $file: " . $e->getMessage());
            }
        }

        // Limpieza
        Storage::deleteDirectory($tmpDir);

        // Actualizar Request
        $this->updateRequestStats($requestId, $xmlsProcesados);

        Log::info("Procesamiento completado para Request $requestId. XMLs: $xmlsProcesados");
    }

    public function parseCfdi(string $xmlContent): ?array
    {
        $dom = new DOMDocument();
        @$dom->loadXML($xmlContent);

        $xpath = new \DOMXPath($dom);
        $xpath->registerNamespace('cfdi', 'http://www.sat.gob.mx/cfd/4');
        $xpath->registerNamespace('tfd', 'http://www.sat.gob.mx/TimbreFiscalDigital');

        // UUID
        $uuidNode = $xpath->query('//tfd:TimbreFiscalDigital/@UUID')->item(0);
        if (!$uuidNode) {
            // Intentar versión 3.3 o anterior si falla
            $uuidNode = $dom->getElementsByTagNameNS('http://www.sat.gob.mx/TimbreFiscalDigital', 'TimbreFiscalDigital')->item(0);
            if ($uuidNode)
                $uuid = $uuidNode->getAttribute('UUID');
            else
                return null;
        }
        else {
            $uuid = $uuidNode->nodeValue;
        }

        // Comprobante (Raíz)
        $comprobante = $dom->documentElement;
        $fechaStr = $comprobante->getAttribute('Fecha');
        $total = $comprobante->getAttribute('Total');
        $tipo = $comprobante->getAttribute('TipoDeComprobante');

        // Emisor
        $emisorNode = $dom->getElementsByTagName('Emisor')->item(0)
            ?? $dom->getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Emisor')->item(0);

        $rfcEmisor = $emisorNode ? $emisorNode->getAttribute('Rfc') : '';
        $nombreEmisor = $emisorNode ? $emisorNode->getAttribute('Nombre') : '';

        // Receptor
        $receptorNode = $dom->getElementsByTagName('Receptor')->item(0)
            ?? $dom->getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Receptor')->item(0);

        $rfcReceptor = $receptorNode ? $receptorNode->getAttribute('Rfc') : '';
        $nombreReceptor = $receptorNode ? $receptorNode->getAttribute('Nombre') : '';

        // Concepto (Primer concepto)
        $conceptoNode = $xpath->query('//cfdi:Conceptos/cfdi:Concepto')->item(0);
        $concepto = $conceptoNode ? $conceptoNode->getAttribute('Descripcion') : '';

        // Impuestos Globales
        // Nota: En CFDI 4.0/3.3, los impuestos globales están en /Comprobante        // Impuestos Globales
        $nodosImpuestos = $xpath->query('/*[local-name()="Comprobante"]/*[local-name()="Impuestos"]');
        $impuestosNode = $nodosImpuestos->item($nodosImpuestos->length - 1);

        $iva = 0;
        $retenciones = 0;

        if ($impuestosNode) {
            $traslados = $impuestosNode->getAttribute('TotalImpuestosTrasladados');
            $ret = $impuestosNode->getAttribute('TotalImpuestosRetenidos');

            if (is_numeric($traslados))
                $iva = $traslados;
            if (is_numeric($ret))
                $retenciones = $ret;
        }

        try {
            $fecha = new DateTimeImmutable($fechaStr);
        }
        catch (Exception $e) {
            $fecha = new DateTimeImmutable(); // Fallback warning
        }

        return [
            'uuid' => strtoupper($uuid),
            'fecha' => $fecha,
            'rfc_emisor' => $rfcEmisor,
            'name_emisor' => $nombreEmisor,
            'rfc_receptor' => $rfcReceptor,
            'name_receptor' => $nombreReceptor,
            'total' => $total ?: 0,
            'subtotal' => 0, // Placeholder
            'concepto' => $concepto,
            'iva' => $iva,
            'retenciones' => $retenciones,
            'tipo' => $tipo,
        ];
    }

    protected function indexCfdi(array $data, string $path, string $requestId)
    {
        // Verificar existencia
        $exists = Cfdi::where('uuid', $data['uuid'])->exists();

        if ($exists) {
            Log::info("UUID ya registrado: " . $data['uuid']);
            return;
        }

        Cfdi::create([
            'uuid' => $data['uuid'],
            'rfc_emisor' => $data['rfc_emisor'],
            'rfc_receptor' => $data['rfc_receptor'],
            'name_emisor' => $data['name_emisor'],
            'name_receptor' => $data['name_receptor'],
            'fecha' => $data['fecha'],
            'tipo' => $data['tipo'],
            'total' => $data['total'],
            'concepto' => $data['concepto'],
            'iva' => $data['iva'],
            'retenciones' => $data['retenciones'],
            'path_xml' => $path,
            'request_id' => $requestId,
        ]);
    }

    protected function updateRequestStats(string $requestId, int $count)
    {
        $req = SatRequest::where('request_id', $requestId)->first();
        if ($req) {
            $req->xml_count += $count;
            $req->state = 'completed'; // Asumimos completado tras procesar
            $req->save();
        }
    }
}
