<?php

namespace App\Http\Controllers;

use App\Models\Cfdi;
use App\Models\SatRequest;
use App\Models\Business;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Barryvdh\DomPDF\Facade\Pdf;

class InvoiceController extends Controller
{
    public function indexCfdis(Request $request)
    {
        $query = Cfdi::query();
        if ($request->has('rfc_user')) {
            $rfcUser = trim(strtoupper($request->input('rfc_user')));
            $tipo = $request->input('tipo');
            if ($tipo === 'emitidas') {
                $query->where('rfc_emisor', 'like', "$rfcUser%");
            }
            elseif ($tipo === 'recibidas') {
                $query->where('rfc_receptor', 'like', "$rfcUser%");
            }
            else {
                $query->where(function ($q) use ($rfcUser) {
                    $q->where('rfc_emisor', 'like', "$rfcUser%")->orWhere('rfc_receptor', 'like', "$rfcUser%");
                });
            }
        }
        if ($request->filled('year')) {
            $query->whereYear('fecha_fiscal', $request->input('year'));
        }
        if ($request->filled('month')) {
            $query->whereMonth('fecha_fiscal', $request->input('month'));
        }
        if ($request->filled('q')) {
            $q = $request->input('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('uuid', 'like', "%$q%")->orWhere('rfc_emisor', 'like', "%$q%")->orWhere('rfc_receptor', 'like', "%$q%");
            });
        }
        if ($request->filled('cfdi_tipo')) {
            $query->where('tipo', $request->input('cfdi_tipo'));
        }
        if ($request->filled('status')) {
            if ($request->input('status') === 'cancelados') {
                $query->where('es_cancelado', 1);
            }
            else {
                $query->where('es_cancelado', 0);
            }
        }
        $query->orderBy('fecha_fiscal', 'desc');
        return response()->json($query->paginate($request->input('pageSize', 20)));
    }

    public function getPeriods(Request $request)
    {
        $rfcUser = trim(strtoupper($request->input('rfc_user')));
        if (!$rfcUser)
            return response()->json([]);
        return response()->json(Cfdi::selectRaw('substr(fecha_fiscal, 1, 7) as period')->where(function ($q) use ($rfcUser) {
            $q->where('rfc_emisor', 'like', "$rfcUser%")->orWhere('rfc_receptor', 'like', "$rfcUser%");
        })->groupBy('period')->orderBy('period', 'desc')->pluck('period'));
    }

    private function parseCfdiData(Cfdi $cfdiModel)
    {
        $xmlContent = \Illuminate\Support\Facades\Storage::get($cfdiModel->path_xml);
        $dom = new \DOMDocument();
        @$dom->loadXML((string)$xmlContent);
        $xpath = new \DOMXPath($dom);
        $xpath->registerNamespace('cfdi', 'http://www.sat.gob.mx/cfd/4');
        $xpath->registerNamespace('cfdi33', 'http://www.sat.gob.mx/cfd/3');
        $xpath->registerNamespace('tfd', 'http://www.sat.gob.mx/TimbreFiscalDigital');
        $xpath->registerNamespace('pago20', 'http://www.sat.gob.mx/Pagos20');
        $xpath->registerNamespace('pago10', 'http://www.sat.gob.mx/Pagos');
        $xpath->registerNamespace('implocal', 'http://www.sat.gob.mx/implocal');

        $root = $dom->documentElement;
        $version = $root->getAttribute('Version');
        $ns = ($version === '4.0') ? 'cfdi' : 'cfdi33';
        $tipoMap = [
            'I' => 'Ingreso',
            'E' => 'Egreso',
            'P' => 'Pago',
            'T' => 'Traslado',
            'N' => 'Nómina',
            'R' => 'Retenciones'
        ];

        $regimenes = [
            '601' => 'General de Ley Personas Morales',
            '603' => 'Personas Morales con Fines no Lucrativos',
            '605' => 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
            '606' => 'Arrendamiento',
            '607' => 'Enajenación o Adquisición de Bienes',
            '608' => 'Demás ingresos',
            '610' => 'Residentes en el Extranjero sin Establecimiento Permanente en México',
            '611' => 'Ingresos por Dividendos (socios y accionistas)',
            '612' => 'Personas Físicas con Actividades Empresariales y Profesionales',
            '614' => 'Ingresos por Intereses',
            '615' => 'Régimen de los ingresos por obtención de premios',
            '616' => 'Sin obligaciones fiscales',
            '620' => 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
            '621' => 'Incorporación Fiscal',
            '622' => 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
            '623' => 'Opcional para Grupos de Sociedades',
            '624' => 'Coordinados',
            '625' => 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
            '626' => 'Régimen Simplificado de Confianza',
        ];

        $usos = [
            'G01' => 'Adquisición de mercancías',
            'G02' => 'Devoluciones, descuentos o bonificaciones',
            'G03' => 'Gastos en general',
            'I01' => 'Construcciones',
            'I02' => 'Mobiliario y equipo de oficina por inversiones',
            'I03' => 'Equipo de transporte',
            'I04' => 'Equipo de cómputo y accesorios',
            'I05' => 'Dados, troqueles, moldes, matrices y herramental',
            'I06' => 'Comunicaciones telefónicas',
            'I07' => 'Comunicaciones satelitales',
            'I08' => 'Otra maquinaria y equipo',
            'D01' => 'Honorarios médicos, dentales y gastos hospitalarios',
            'D02' => 'Gastos médicos por incapacidad o discapacidad',
            'D03' => 'Gastos funerales',
            'D04' => 'Donativos',
            'D05' => 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
            'D06' => 'Aportaciones voluntarias al SAR',
            'D07' => 'Primas por seguros de gastos médicos',
            'D08' => 'Gastos de transportación escolar obligatoria',
            'D09' => 'Depósitos en cuentas especiales para el ahorro, primas que tengan como base planes de pensiones',
            'D10' => 'Pagos por servicios educativos (colegiaturas)',
            'S01' => 'Sin efectos fiscales',
            'CP01' => 'Pagos',
            'CN01' => 'Nómina',
        ];

        $exportacionMap = [
            '01' => '01 - No aplica',
            '02' => '02 - Definitiva',
            '03' => '03 - Temporal',
            '04' => '04 - Definitiva con clave distinta a A1',
        ];

        $monedaMap = [
            'MXN' => 'MXN - Peso Mexicano',
            'USD' => 'USD - Dólar americano',
            'EUR' => 'EUR - Euro',
        ];

        $data = [
            'uuid' => $cfdiModel->uuid,
            'version' => $version,
            'serie' => $root->getAttribute('Serie'),
            'folio' => $root->getAttribute('Folio'),
            'fecha' => $root->getAttribute('Fecha'),
            'tipo_comprobante' => $root->getAttribute('TipoDeComprobante'),
            'tipo_descripcion' => $root->getAttribute('TipoDeComprobante') . ' - ' . ($tipoMap[$root->getAttribute('TipoDeComprobante')] ?? 'Comprobante'),
            'no_certificado_emisor' => $root->getAttribute('NoCertificado'),
            'moneda' => $root->getAttribute('Moneda'),
            'moneda_desc' => $monedaMap[$root->getAttribute('Moneda')] ?? $root->getAttribute('Moneda'),
            'lugar_expedicion' => $root->getAttribute('LugarExpedicion'),
            'subtotal' => $root->getAttribute('SubTotal'),
            'descuento' => $root->getAttribute('Descuento') ?: 0,
            'total' => $root->getAttribute('Total'),
            'total_letra' => $this->amountToWords($root->getAttribute('Total'), $root->getAttribute('Moneda')),
            'sello_cfd' => $root->getAttribute('Sello'),
            'forma_pago' => $root->getAttribute('FormaPago'),
            'metodo_pago' => $root->getAttribute('MetodoPago'),
            'exportacion' => $exportacionMap[$root->getAttribute('Exportacion')] ?? $root->getAttribute('Exportacion'),
        ];

        $infoGlobal = $xpath->query("//$ns:InformacionGlobal")->item(0);
        if ($infoGlobal) {
            $periodicidadMap = [
                '01' => 'Diario', '02' => 'Semanal', '03' => 'Quincenal', '04' => 'Mensual', '05' => 'Bimestral'
            ];
            $mesesMap = [
                '01' => 'Enero', '02' => 'Febrero', '03' => 'Marzo', '04' => 'Abril', '05' => 'Mayo', '06' => 'Junio',
                '07' => 'Julio', '08' => 'Agosto', '09' => 'Septiembre', '10' => 'Octubre', '11' => 'Noviembre', '12' => 'Diciembre',
                '13' => 'Enero-Febrero', '14' => 'Marzo-Abril', '15' => 'Mayo-Junio', '16' => 'Julio-Agosto', '17' => 'Septiembre-Octubre', '18' => 'Noviembre-Diciembre'
            ];
            $p = $infoGlobal->getAttribute('Periodicidad');
            $m = $infoGlobal->getAttribute('Meses');
            $data['informacion_global'] = [
                'periodicidad' => $p,
                'periodicidad_desc' => $periodicidadMap[$p] ?? $p,
                'meses' => $m,
                'meses_desc' => $mesesMap[$m] ?? $m,
                'anio' => $infoGlobal->getAttribute('Año')
            ];
        }
        else {
            $data['informacion_global'] = null;
        }

        $emisor = $xpath->query("//$ns:Emisor")->item(0);
        $eReg = $emisor ? $emisor->getAttribute('RegimenFiscal') : '';
        $data['emisor'] = [
            'rfc' => $emisor ? $emisor->getAttribute('Rfc') : '',
            'nombre' => $emisor ? $emisor->getAttribute('Nombre') : '',
            'regimen' => $eReg,
            'regimen_desc' => $eReg . ' - ' . ($regimenes[$eReg] ?? '')
        ];

        $receptor = $xpath->query("//$ns:Receptor")->item(0);
        $rUso = $receptor ? $receptor->getAttribute('UsoCFDI') : '';
        $rReg = $receptor ? $receptor->getAttribute('RegimenFiscalReceptor') : '';
        $data['receptor'] = [
            'rfc' => $receptor ? $receptor->getAttribute('Rfc') : '',
            'nombre' => $receptor ? $receptor->getAttribute('Nombre') : '',
            'uso' => $rUso,
            'uso_desc' => $rUso . ' - ' . ($usos[$rUso] ?? ''),
            'regimen' => $rReg,
            'regimen_desc' => $rReg ? ($rReg . ' - ' . ($regimenes[$rReg] ?? '')) : '',
            'domicilio' => $receptor ? $receptor->getAttribute('DomicilioFiscalReceptor') : ''
        ];

        $objImpMap = [
            '01' => 'No objeto de impuesto.',
            '02' => 'Sí objeto de impuesto.',
            '03' => 'Sí objeto de impuesto y no obligado al desglose.',
            '04' => 'Sí objeto de impuesto y no causa impuesto.',
        ];

        $impuestoNames = [
            '001' => 'ISR',
            '002' => 'IVA',
            '003' => 'IEPS',
        ];

        $data['conceptos'] = [];
        foreach ($xpath->query("//$ns:Conceptos/$ns:Concepto") as $con) {
            $objIdx = $con->getAttribute('ObjetoImp');
            $concept = [
                'cantidad' => $con->getAttribute('Cantidad'),
                'clave_unit' => $con->getAttribute('ClaveUnidad'),
                'unidad' => $con->getAttribute('Unidad'),
                'clave_prod_serv' => $con->getAttribute('ClaveProdServ'),
                'descripcion' => $con->getAttribute('Descripcion'),
                'no_identificacion' => $con->getAttribute('NoIdentificacion'),
                'valor_unitario' => $con->getAttribute('ValorUnitario'),
                'importe' => $con->getAttribute('Importe'),
                'objeto_imp' => $objIdx,
                'objeto_imp_desc' => $objIdx . ' - ' . ($objImpMap[$objIdx] ?? ''),
                'traslados' => [],
                'retenciones' => []
            ];

            // Tax per concept
            foreach ($xpath->query(".//cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado", $con) as $t) {
                $code = $t->getAttribute('Impuesto');
                $concept['traslados'][] = [
                    'impuesto' => $code,
                    'impuesto_desc' => $impuestoNames[$code] ?? $code,
                    'base' => $t->getAttribute('Base'),
                    'tasa' => $t->getAttribute('TasaOCuota'),
                    'importe' => $t->getAttribute('Importe'),
                    'tipo_factor' => $t->getAttribute('TipoFactor')
                ];
            }

            foreach ($xpath->query(".//cfdi:Impuestos/cfdi:Retenciones/cfdi:Retencion", $con) as $r) {
                $code = $r->getAttribute('Impuesto');
                $concept['retenciones'][] = [
                    'impuesto' => $code,
                    'impuesto_desc' => $impuestoNames[$code] ?? $code,
                    'base' => $r->getAttribute('Base'),
                    'tasa' => $r->getAttribute('TasaOCuota'),
                    'importe' => $r->getAttribute('Importe'),
                    'tipo_factor' => $r->getAttribute('TipoFactor')
                ];
            }

            $data['conceptos'][] = $concept;
        }

        $data['traslados'] = [];
        foreach ($xpath->query("/*/$ns:Impuestos/$ns:Traslados/$ns:Traslado") as $tras) {
            $code = $tras->getAttribute('Impuesto');
            $data['traslados'][] = [
                'impuesto' => $code,
                'impuesto_desc' => $impuestoNames[$code] ?? $code,
                'tasa' => $tras->getAttribute('TasaOCuota'),
                'importe' => $tras->getAttribute('Importe')
            ];
        }

        $data['retenciones'] = [];
        foreach ($xpath->query("/*/$ns:Impuestos/$ns:Retenciones/$ns:Retencion") as $ret) {
            $code = $ret->getAttribute('Impuesto');
            $data['retenciones'][] = [
                'impuesto' => $code,
                'impuesto_desc' => $impuestoNames[$code] ?? $code,
                'importe' => $ret->getAttribute('Importe')
            ];
        }

        // Impuestos Locales
        $data['impuestos_locales'] = [
            'traslados' => [],
            'retenciones' => []
        ];
        $locales = $xpath->query("//implocal:ImpuestosLocales")->item(0);
        if ($locales) {
            foreach ($xpath->query("./implocal:TrasladosLocales", $locales) as $t) {
                $data['impuestos_locales']['traslados'][] = [
                    'nombre' => $t->getAttribute('ImpLocTrasladado'),
                    'tasa' => $t->getAttribute('TasadeTraslado'),
                    'importe' => $t->getAttribute('Importe')
                ];
            }
            foreach ($xpath->query("./implocal:RetencionesLocales", $locales) as $r) {
                $data['impuestos_locales']['retenciones'][] = [
                    'nombre' => $r->getAttribute('ImpLocRetenido'),
                    'tasa' => $r->getAttribute('TasadeRetencion'),
                    'importe' => $r->getAttribute('Importe')
                ];
            }
        }

        $tfd = $xpath->query("//tfd:TimbreFiscalDigital")->item(0);
        if ($tfd) {
            $data['sello_sat'] = $tfd->getAttribute('SelloSAT');
            $data['no_certificado_sat'] = $tfd->getAttribute('NoCertificadoSAT');
            $data['fecha_timbrado'] = $tfd->getAttribute('FechaTimbrado');
            $data['rfc_prov_certif'] = $tfd->getAttribute('RfcProvCertif');
            $data['cadena_original'] = "||1.1|" . $cfdiModel->uuid . "|" . $data['fecha_timbrado'] . "|" . $data['rfc_prov_certif'] . "|" . $data['sello_cfd'] . "|" . $data['no_certificado_sat'] . "||";
        }

        $qrString = "https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id={$cfdiModel->uuid}&re={$data['emisor']['rfc']}&rr={$data['receptor']['rfc']}&tt={$data['total']}&fe=" . substr($data['sello_cfd'], -8);
        $data['qrCode'] = '';
        try {
            $data['qrCode'] = base64_encode(\SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')->size(100)->margin(0)->generate($qrString));
        }
        catch (\Throwable $e) {
        }

        $tiposRelacion = [
            '01' => 'Nota de crédito de los documentos relacionados',
            '02' => 'Nota de débito de los documentos relacionados',
            '03' => 'Devolución de mercancía sobre facturas o traslados previos',
            '04' => 'Sustitución de los CFDI previos',
            '05' => 'Traslados de mercancias facturados previamente',
            '06' => 'Factura generada por los traslados previos',
            '07' => 'CFDI por aplicación de anticipo',
        ];

        $cfdiRelacionados = $xpath->query("//$ns:CfdiRelacionados")->item(0);
        $data['relacionados'] = null;
        if ($cfdiRelacionados) {
            $tipoRel = $cfdiRelacionados->getAttribute('TipoRelacion');
            $relData = [
                'tipo' => $tipoRel,
                'tipo_desc' => $tipoRel . ' - ' . ($tiposRelacion[$tipoRel] ?? ''),
                'uuids' => []
            ];
            foreach ($xpath->query("./$ns:CfdiRelacionado", $cfdiRelacionados) as $rel) {
                $ruuid = strtoupper($rel->getAttribute('UUID'));
                $relData['uuids'][] = $ruuid;
                $relatedUuids[] = $ruuid;
            }
            $data['relacionados'] = $relData;
        }

        // Detailed Payment Info if it's a payment
        $data['pagos'] = [];
        $relatedUuids = [];
        if ($data['tipo_comprobante'] === 'P') {
            $pagoNodes = $xpath->query("//pago20:Pago | //pago10:Pago");
            foreach ($pagoNodes as $pagoNode) {
                $pagoInfo = [
                    'fecha_pago' => $pagoNode->getAttribute('FechaPago'),
                    'forma_pago' => $pagoNode->getAttribute('FormaDePagoP'),
                    'moneda' => $pagoNode->getAttribute('MonedaP'),
                    'monto' => $pagoNode->getAttribute('Monto'),
                    'doctos_relacionados' => []
                ];

                $docRelNodes = $xpath->query(".//pago20:DoctoRelacionado | .//pago10:DoctoRelacionado", $pagoNode);
                foreach ($docRelNodes as $docRel) {
                    $uuid = strtoupper($docRel->getAttribute('IdDocumento'));
                    $relatedUuids[] = $uuid;
                    $pagoInfo['doctos_relacionados'][] = [
                        'uuid' => $uuid,
                        'serie' => $docRel->getAttribute('Serie'),
                        'folio' => $docRel->getAttribute('Folio'),
                        'moneda' => $docRel->getAttribute('MonedaDR'),
                        'num_parcialidad' => $docRel->getAttribute('NumParcialidad'),
                        'saldo_anterior' => $docRel->getAttribute('ImpSaldoAnt'),
                        'importe_pagado' => $docRel->getAttribute('ImpPagado'),
                        'saldo_insoluto' => $docRel->getAttribute('ImpSaldoInsoluto'),
                    ];
                }
                $data['pagos'][] = $pagoInfo;
            }
        }
        $data['related_uuids'] = array_unique($relatedUuids);

        return $data;
    }

    private function generatePdfContent(Cfdi $cfdiModel)
    {
        $mainData = $this->parseCfdiData($cfdiModel);
        $allCfdis = [$mainData];

        foreach ($mainData['related_uuids'] as $uuid) {
            $relModel = Cfdi::where('uuid', $uuid)->first();
            if ($relModel) {
                $allCfdis[] = $this->parseCfdiData($relModel);
            }
        }

        $pdf = Pdf::loadView('pdf.cfdi', ['cfdis' => $allCfdis]);
        $pdf->setPaper('letter', 'portrait');
        return $pdf->output();
    }

    public function showCfdi($uuid)
    {
        return response()->json(['metadata' => Cfdi::where('uuid', $uuid)->firstOrFail(), 'xml_url' => url("api/cfdis/$uuid/xml")]);
    }

    public function downloadXml($uuid)
    {
        $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();
        return \Illuminate\Support\Facades\Storage::download($cfdi->path_xml);
    }

    public function downloadPdf($uuid)
    {
        try {
            $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();
            $pdfContent = $this->generatePdfContent($cfdi);
            return response($pdfContent)
                ->header('Content-Type', 'application/pdf')
                ->header('Content-Disposition', 'attachment; filename="' . $cfdi->uuid . '.pdf"');
        }
        catch (\Exception $e) {
            Log::error("PDF Error: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function downloadSingleZip($uuid)
    {
        try {
            $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();
            $zipName = $cfdi->uuid . '.zip';
            $zipPath = storage_path('app/temp/' . $zipName);

            if (!file_exists(storage_path('app/temp'))) {
                mkdir(storage_path('app/temp'), 0755, true);
            }

            $zip = new \ZipArchive();
            if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) === TRUE) {
                $xmlContent = Storage::get($cfdi->path_xml);
                $zip->addFromString($cfdi->uuid . '.xml', $xmlContent);

                $pdfContent = $this->generatePdfContent($cfdi);
                $zip->addFromString($cfdi->uuid . '.pdf', $pdfContent);

                $zip->close();
            }

            return response()->download($zipPath)->deleteFileAfterSend(true);
        }
        catch (\Exception $e) {
            Log::error("ZIP Error: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    private function amountToWords($number, $currency = 'MXN')
    {
        try {
            $formatter = new \NumberFormatter('es', \NumberFormatter::SPELLOUT);
            $integerPart = (int)floor($number);
            $decimalPart = (int)round(($number - $integerPart) * 100);

            $text = mb_strtoupper($formatter->format($integerPart));
            $cents = str_pad($decimalPart, 2, '0', STR_PAD_LEFT);

            if ($currency === 'MXN' || $currency === 'PESOS' || empty($currency)) {
                return "({$text} PESOS {$cents}/100 M.N.)";
            }
            else {
                return "({$text} {$currency} {$cents}/100)";
            }
        }
        catch (\Throwable $e) {
            return "(" . number_format($number, 2) . " $currency)";
        }
    }

    public function refreshCfdiStatus($uuid, \App\Services\SatStatusService $service)
    {
        $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();
        $result = $service->checkStatus($cfdi->uuid, $cfdi->rfc_emisor, $cfdi->rfc_receptor, number_format($cfdi->total, 2, '.', ''));
        if ($result['estado'] !== 'Error') {
            $cfdi->update(['estado_sat' => $result['estado'], 'estado_sat_updated_at' => now(), 'es_cancelado' => ($result['estado'] === 'Cancelado' ? 1 : 0)]);
        }
        return response()->json(['metadata' => $cfdi, 'sat_response' => $result]);
    }

    public function showRequest($id)
    {
        return response()->json(\App\Models\SatRequest::where('id', $id)->orWhere('request_id', $id)->firstOrFail());
    }
    public function startSync(Request $request, \App\Services\BusinessSyncService $service)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json(['error' => 'RFC required'], 400);

        $force = (bool)$request->input('force', false);
        return response()->json($service->syncIfNeeded(\App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail(), $force));
    }
    public function verifyStatus(Request $request, \App\Services\BusinessSyncService $service)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json(['error' => 'RFC required'], 400);
        return response()->json($service->verifyInvoices(\App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail(), $request->all()));
    }
    public function getActiveRequests(Request $request)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json([]);
        return response()->json(\App\Models\SatRequest::where('rfc', strtoupper($rfc))->orderBy('created_at', 'desc')->limit(5)->get());
    }
    public function getRecentRequests()
    {
        return response()->json(\App\Models\SatRequest::select('sat_requests.*', 'businesses.legal_name as business_name')->join('businesses', 'sat_requests.rfc', '=', 'businesses.rfc')->orderBy('sat_requests.created_at', 'desc')->limit(10)->get());
    }

    public function indexSatRequests(Request $request)
    {
        $query = \App\Models\SatRequest::select('sat_requests.*', 'businesses.legal_name as business_name')
            ->join('businesses', 'sat_requests.rfc', '=', 'businesses.rfc')
            ->orderBy('sat_requests.created_at', 'desc');

        if ($request->has('rfc')) {
            $query->where('sat_requests.rfc', strtoupper($request->input('rfc')));
        }

        return response()->json($query->paginate($request->input('pageSize', 20)));
    }
    public function getRunnerStatus()
    {
        $lastRequest = \App\Models\SatRequest::orderBy('updated_at', 'desc')->first();
        return response()->json([
            'last_activity' => $lastRequest ? $lastRequest->updated_at : null,
            'is_alive' => $lastRequest ? $lastRequest->updated_at->gt(now()->subMinutes(10)) : false
        ]);
    }

    public function exportExcel(Request $request)
    {
        $query = Cfdi::query();
        if ($request->has('rfc_user')) {
            $rfcUser = trim(strtoupper($request->input('rfc_user')));
            $tipo = $request->input('tipo');
            if ($tipo === 'emitidas') {
                $query->where('rfc_emisor', 'like', "$rfcUser%");
            }
            elseif ($tipo === 'recibidas') {
                $query->where('rfc_receptor', 'like', "$rfcUser%");
            }
            else {
                $query->where(function ($q) use ($rfcUser) {
                    $q->where('rfc_emisor', 'like', "$rfcUser%")->orWhere('rfc_receptor', 'like', "$rfcUser%");
                });
            }
        }
        if ($request->filled('year')) {
            $query->whereYear('fecha_fiscal', $request->input('year'));
        }
        if ($request->filled('month')) {
            $query->whereMonth('fecha_fiscal', $request->input('month'));
        }
        if ($request->filled('q')) {
            $q = $request->input('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('uuid', 'like', "%$q%")->orWhere('rfc_emisor', 'like', "%$q%")->orWhere('rfc_receptor', 'like', "%$q%");
            });
        }
        if ($request->filled('cfdi_tipo')) {
            $query->where('tipo', $request->input('cfdi_tipo'));
        }
        if ($request->filled('status')) {
            if ($request->input('status') === 'cancelados') {
                $query->where('es_cancelado', 1);
            }
            else {
                $query->where('es_cancelado', 0);
            }
        }
        $query->orderBy('fecha_fiscal', 'desc');

        $rows = $query->get();

        $columnsParam = $request->input('columns', 'uuid,fecha,rfc_emisor,name_emisor,rfc_receptor,name_receptor,total,moneda');
        $columns = explode(',', $columnsParam);

        $callback = function () use ($rows, $columns) {
            $file = fopen('php://output', 'w');
            // BOM for Excel
            fputs($file, "\xEF\xBB\xBF");

            fputcsv($file, $columns);
            foreach ($rows as $cfdi) {
                $data = [];
                foreach ($columns as $col) {
                    $data[] = $cfdi->{ $col} ?? '';
                }
                fputcsv($file, $data);
            }
            fclose($file);
        };

        return response()->stream($callback, 200, [
            "Content-type" => "text/csv",
            "Content-Disposition" => "attachment; filename=export_cfdis_" . date('Y-m-d_H-i-s') . ".csv",
            "Pragma" => "no-cache",
            "Cache-Control" => "must-revalidate, post-check=0, pre-check=0",
            "Expires" => "0"
        ]);
    }

    public function downloadBulkPdf(Request $request)
    {
        try {
            $query = Cfdi::query();
            if ($request->has('rfc_user')) {
                $rfcUser = trim(strtoupper($request->input('rfc_user')));
                $tipo = $request->input('tipo');
                if ($tipo === 'emitidas') {
                    $query->where('rfc_emisor', 'like', "$rfcUser%");
                }
                elseif ($tipo === 'recibidas') {
                    $query->where('rfc_receptor', 'like', "$rfcUser%");
                }
                else {
                    $query->where(function ($q) use ($rfcUser) {
                        $q->where('rfc_emisor', 'like', "$rfcUser%")->orWhere('rfc_receptor', 'like', "$rfcUser%");
                    });
                }
            }
            if ($request->filled('year')) {
                $query->whereYear('fecha_fiscal', $request->input('year'));
            }
            if ($request->filled('month')) {
                $query->whereMonth('fecha_fiscal', $request->input('month'));
            }
            if ($request->filled('q')) {
                $q = $request->input('q');
                $query->where(function ($sub) use ($q) {
                    $sub->where('uuid', 'like', "%$q%")->orWhere('rfc_emisor', 'like', "%$q%")->orWhere('rfc_receptor', 'like', "%$q%");
                });
            }
            if ($request->filled('status')) {
                if ($request->input('status') === 'cancelados') {
                    $query->where('es_cancelado', 1);
                }
                else {
                    $query->where('es_cancelado', 0);
                }
            }

            $cfdis = $query->get();

            if ($cfdis->isEmpty()) {
                return response()->json(['error' => 'No se encontraron facturas con los criterios seleccionados'], 404);
            }

            $zipName = 'export_pdf_' . now()->format('Ymd_His') . '.zip';
            $zipPath = storage_path('app/temp/' . $zipName);

            if (!file_exists(storage_path('app/temp'))) {
                mkdir(storage_path('app/temp'), 0755, true);
            }

            $zip = new \ZipArchive();
            if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) === TRUE) {
                foreach ($cfdis as $cfdi) {
                    try {
                        $pdfContent = $this->generatePdfContent($cfdi);
                        $filename = ($cfdi->serie ? $cfdi->serie . '_' : '') . ($cfdi->folio ?: $cfdi->uuid) . '.pdf';
                        $zip->addFromString($filename, $pdfContent);
                    }
                    catch (\Exception $e) {
                        Log::error("Bulk PDF skip UUID {$cfdi->uuid}: " . $e->getMessage());
                    }
                }
                $zip->close();
            }

            return response()->download($zipPath)->deleteFileAfterSend(true);
        }
        catch (\Exception $e) {
            Log::error("Bulk PDF Error: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function deleteSatRequest($id)
    {
        $request = \App\Models\SatRequest::findOrFail($id);
        $request->delete();
        return response()->json(['message' => 'Solicitud eliminada correctamente']);
    }
}
