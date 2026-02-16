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
        $zipOpen = $zip->open($fullZipPath);

        if ($zipOpen === TRUE) {
            $zip->extractTo($fullTmpDir);
            $zip->close();
        }
        else {
            // Intentar buscar carpeta ya extraida (Fallback de SatRunnerCommand)
            $possibleExtractedPath = substr($fullZipPath, 0, -4); // Quitar .zip
            if (is_dir($possibleExtractedPath)) {
                Log::info("Usando carpeta pre-extraída: $possibleExtractedPath");
                // Copiar archivos a tmpDir para uniformizar procesamiento y limpieza
                // O simplemente moverlos? Copiar es mas seguro.
                // Usaremos exec para rapidez.
                exec("cp -r \"$possibleExtractedPath/.\" \"$fullTmpDir/\"");
            }
            else {
                Log::error("No se pudo abrir el ZIP y no se encontró carpeta extraída: $fullZipPath (Código: $zipOpen)");
                return;
            }
        }


        $xmlsProcesados = 0;
        $files = Storage::allFiles($tmpDir);

        DB::beginTransaction();
        try {
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
            DB::commit();
        }
        catch (Exception $e) {
            DB::rollBack();
            Log::error("Error fatal en transacción de procesamiento: " . $e->getMessage());
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
        $xpath->registerNamespace('implocal', 'http://www.sat.gob.mx/implocal');

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

        // Preferir Fecha de Timbrado (Certificación) para la contabilidad si está disponible
        $tfd = $xpath->query('//tfd:TimbreFiscalDigital')->item(0);
        if ($tfd && $tfd->getAttribute('FechaTimbrado')) {
            $fechaStr = $tfd->getAttribute('FechaTimbrado');
        }
        $total = $comprobante->getAttribute('Total');
        $subtotal = $comprobante->getAttribute('SubTotal');
        $descuento = $comprobante->getAttribute('Descuento') ?: 0;
        $moneda = $comprobante->getAttribute('Moneda');
        $tipoCambio = $comprobante->getAttribute('TipoCambio') ?: 1;
        $formaPago = $comprobante->getAttribute('FormaPago');
        $metodoPago = $comprobante->getAttribute('MetodoPago');
        $tipo = $comprobante->getAttribute('TipoDeComprobante');
        $exportacion = $comprobante->getAttribute('Exportacion');
        $serie = $comprobante->getAttribute('Serie');
        $folio = $comprobante->getAttribute('Folio');

        // Información Global (CFDI 4.0 para público en general)
        $globalPeriodicidad = null;
        $globalMeses = null;
        $globalYear = null;
        $infoGlobalNode = $xpath->query('//cfdi:InformacionGlobal')->item(0);
        if ($infoGlobalNode) {
            $globalPeriodicidad = $infoGlobalNode->getAttribute('Periodicidad');
            $globalMeses = $infoGlobalNode->getAttribute('Meses');
            $globalYear = (int)$infoGlobalNode->getAttribute('Año');
        }

        // Emisor ...
        $emisorNode = $dom->getElementsByTagName('Emisor')->item(0)
            ?? $dom->getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Emisor')->item(0);

        $rfcEmisor = $emisorNode ? $emisorNode->getAttribute('Rfc') : '';
        $nombreEmisor = $emisorNode ? $emisorNode->getAttribute('Nombre') : '';
        $regimenEmisor = $emisorNode ? $emisorNode->getAttribute('RegimenFiscal') : '';

        // Receptor
        $receptorNode = $dom->getElementsByTagName('Receptor')->item(0)
            ?? $dom->getElementsByTagNameNS('http://www.sat.gob.mx/cfd/4', 'Receptor')->item(0);

        $rfcReceptor = $receptorNode ? $receptorNode->getAttribute('Rfc') : '';
        $nombreReceptor = $receptorNode ? $receptorNode->getAttribute('Nombre') : '';
        $usoCfdi = $receptorNode ? $receptorNode->getAttribute('UsoCFDI') : '';
        $regimenReceptor = $receptorNode ? $receptorNode->getAttribute('RegimenFiscalReceptor') : '';
        $domicilioReceptor = $receptorNode ? $receptorNode->getAttribute('DomicilioFiscalReceptor') : '';

        // Concepto (Primer concepto)
        $conceptoNode = $xpath->query('//cfdi:Conceptos/cfdi:Concepto')->item(0);
        $concepto = $conceptoNode ? $conceptoNode->getAttribute('Descripcion') : '';

        // Impuestos Globales
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

        // Impuestos Locales
        $trasladosLocales = 0;
        $retencionesLocales = 0;
        $impuestosLocalesNode = $xpath->query('//implocal:ImpuestosLocales')->item(0);
        if ($impuestosLocalesNode) {
            $trasladosLocales = $impuestosLocalesNode->getAttribute('TotaldeTraslados') ?: 0;
            $retencionesLocales = $impuestosLocalesNode->getAttribute('TotaldeRetenciones') ?: 0;
        }



        try {
            $fecha = new DateTimeImmutable($fechaStr);
            $fechaFiscal = $fecha;

            // Si hay información global, la fecha fiscal de acumulación es la del periodo reportado
            if ($globalYear && $globalMeses) {
                // El campo Meses puede venir como '01'..'12' o '13'..'18' para bimestrales
                // Mapeamos a un mes calendario real para la fecha fiscal (el primer mes del periodo)
                $mesMapeado = (int)$globalMeses;
                if ($mesMapeado > 12) {
                    // 13: Ene-Feb, 14: Mar-Abr, etc.
                    $mesMapeado = (($mesMapeado - 13) * 2) + 1;
                }

                // Asegurar que el año y mes sean válidos para crear la fecha fiscal
                try {
                    $fechaFiscal = $fechaFiscal->setDate($globalYear, $mesMapeado, 1)->setTime(0, 0, 0);
                }
                catch (\Exception $e) {
                    // Fallback a fecha original si hay error en datos globales
                    $fechaFiscal = $fecha;
                }
            }
        }
        catch (Exception $e) {
            $fecha = new DateTimeImmutable();
            $fechaFiscal = $fecha;
        }

        // Pagos (REP) extraction
        $payments = [];
        if ($tipo === 'P') {
            $nodosPago = $xpath->query('//*[local-name()="Pago"]');
            foreach ($nodosPago as $nodoPago) {
                $fechaPago = $nodoPago->getAttribute('FechaPago');
                $monedaP = $nodoPago->getAttribute('MonedaP');
                $tcP = $nodoPago->getAttribute('TipoCambioP') ?: 1;

                $nodosDoctoRel = $xpath->query('.//*[local-name()="DoctoRelacionado"]', $nodoPago);
                foreach ($nodosDoctoRel as $nodoDoctoRel) {
                    $payments[] = [
                        'uuid_relacionado' => strtoupper($nodoDoctoRel->getAttribute('IdDocumento')),
                        'monto_pagado' => $nodoDoctoRel->getAttribute('ImpPagado') ?: $nodoDoctoRel->getAttribute('Importe'),
                        'num_parcialidad' => $nodoDoctoRel->getAttribute('NumParcialidad'),
                        'saldo_anterior' => $nodoDoctoRel->getAttribute('ImpSaldoAnt'),
                        'saldo_insoluto' => $nodoDoctoRel->getAttribute('ImpSaldoInsoluto'),
                        'fecha_pago' => $fechaPago,
                        'moneda_pago' => $monedaP,
                        'tipo_cambio_pago' => $tcP,
                    ];
                }
            }
        }

        return [
            'uuid' => strtoupper($uuid),
            'serie' => $serie,
            'folio' => $folio,
            'fecha' => $fecha,
            'fecha_fiscal' => $fechaFiscal,
            'rfc_emisor' => $rfcEmisor,
            'name_emisor' => $nombreEmisor,
            'regimen_fiscal_emisor' => $regimenEmisor,
            'rfc_receptor' => $rfcReceptor,
            'name_receptor' => $nombreReceptor,
            'regimen_fiscal_receptor' => $regimenReceptor,
            'domicilio_fiscal_receptor' => $domicilioReceptor,
            'total' => $total ?: 0,
            'subtotal' => $subtotal ?: 0,
            'descuento' => $descuento,
            'moneda' => $moneda,
            'tipo_cambio' => $tipoCambio,
            'forma_pago' => $formaPago,
            'metodo_pago' => $metodoPago,
            'uso_cfdi' => $usoCfdi,
            'tipo' => $tipo,
            'exportacion' => $exportacion,
            'concepto' => $concepto,
            'iva' => $iva,
            'retenciones' => $retenciones,
            'traslados_locales' => $trasladosLocales,
            'retenciones_locales' => $retencionesLocales,
            'payments' => $payments,
            'global_periodicidad' => $globalPeriodicidad,
            'global_meses' => $globalMeses,
            'global_year' => $globalYear,
            'full_xml_data' => $this->xmlToArray($dom),
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

        $cfdi = Cfdi::create([
            'uuid' => $data['uuid'],
            'serie' => $data['serie'],
            'folio' => $data['folio'],
            'rfc_emisor' => $data['rfc_emisor'],
            'regimen_fiscal_emisor' => $data['regimen_fiscal_emisor'],
            'rfc_receptor' => $data['rfc_receptor'],
            'regimen_fiscal_receptor' => $data['regimen_fiscal_receptor'],
            'domicilio_fiscal_receptor' => $data['domicilio_fiscal_receptor'],
            'name_emisor' => $data['name_emisor'],
            'name_receptor' => $data['name_receptor'],
            'fecha' => $data['fecha'],
            'tipo' => $data['tipo'],
            'exportacion' => $data['exportacion'],
            'subtotal' => $data['subtotal'],
            'descuento' => $data['descuento'],
            'moneda' => $data['moneda'],
            'tipo_cambio' => $data['tipo_cambio'],
            'forma_pago' => $data['forma_pago'],
            'metodo_pago' => $data['metodo_pago'],
            'uso_cfdi' => $data['uso_cfdi'],
            'total' => $data['total'],
            'concepto' => $data['concepto'],
            'iva' => $data['iva'],
            'retenciones' => $data['retenciones'],
            'traslados_locales' => $data['traslados_locales'] ?? 0,
            'retenciones_locales' => $data['retenciones_locales'] ?? 0,
            'path_xml' => $path,
            'request_id' => $requestId,
            'xml_data' => $data['full_xml_data'] ?? null,
            'global_periodicidad' => $data['global_periodicidad'] ?? null,
            'global_meses' => $data['global_meses'] ?? null,
            'global_year' => $data['global_year'] ?? null,
            'fecha_fiscal' => $data['fecha_fiscal'] ?? $data['fecha'],
        ]);

        if (!empty($data['payments'])) {
            foreach ($data['payments'] as $p) {
                \App\Models\CfdiPayment::create([
                    'uuid_pago' => $data['uuid'],
                    'uuid_relacionado' => $p['uuid_relacionado'],
                    'fecha_pago' => $p['fecha_pago'],
                    'monto_pagado' => $p['monto_pagado'],
                    'num_parcialidad' => $p['num_parcialidad'],
                    'saldo_anterior' => $p['saldo_anterior'],
                    'saldo_insoluto' => $p['saldo_insoluto'],
                    'moneda_pago' => $p['moneda_pago'],
                    'tipo_cambio_pago' => $p['tipo_cambio_pago'],
                ]);
            }
        }
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

    protected function xmlToArray(\DOMDocument $dom)
    {
        $res = [];
        if ($dom->documentElement) {
            $res[$dom->documentElement->tagName] = $this->nodeToArray($dom->documentElement);
        }
        return $res;
    }

    protected function nodeToArray(\DOMNode $node)
    {
        $output = [];
        switch ($node->nodeType) {
            case XML_ELEMENT_NODE:
                foreach ($node->attributes as $attr) {
                    $output['@attributes'][$attr->nodeName] = $attr->nodeValue;
                }
                foreach ($node->childNodes as $child) {
                    $v = $this->nodeToArray($child);
                    if (isset($child->tagName)) {
                        $t = $child->tagName;
                        if (!isset($output[$t])) {
                            $output[$t] = $v;
                        }
                        else {
                            if (!is_array($output[$t]) || !isset($output[$t][0])) {
                                $output[$t] = [$output[$t]];
                            }
                            $output[$t][] = $v;
                        }
                    }
                    elseif ($v || $v === '0') {
                        $output = $v;
                    }
                }
                break;
            case XML_TEXT_NODE:
            case XML_CDATA_SECTION_NODE:
                $output = trim($node->textContent);
                break;
        }
        return $output;
    }
}
