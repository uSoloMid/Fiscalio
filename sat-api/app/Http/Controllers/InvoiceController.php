<?php

namespace App\Http\Controllers;

use App\Models\Cfdi;
use App\Models\SatRequest;
use App\Models\Business;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

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

        $root = $dom->documentElement;
        $version = $root->getAttribute('Version');
        $ns = ($version === '4.0') ? 'cfdi' : 'cfdi33';
        $tipoMap = ['I' => 'Factura (Ingreso)', 'E' => 'Nota de Crédito (Egreso)', 'P' => 'Complemento de Pago', 'T' => 'Traslado', 'N' => 'Nómina'];

        $data = [
            'uuid' => $cfdiModel->uuid,
            'version' => $version,
            'serie' => $root->getAttribute('Serie'),
            'folio' => $root->getAttribute('Folio'),
            'fecha' => $root->getAttribute('Fecha'),
            'tipo_comprobante' => $root->getAttribute('TipoDeComprobante'),
            'tipo_descripcion' => $tipoMap[$root->getAttribute('TipoDeComprobante')] ?? 'Comprobante',
            'no_certificado_emisor' => $root->getAttribute('NoCertificado'),
            'moneda' => $root->getAttribute('Moneda'),
            'lugar_expedicion' => $root->getAttribute('LugarExpedicion'),
            'subtotal' => $root->getAttribute('SubTotal'),
            'descuento' => $root->getAttribute('Descuento') ?: 0,
            'total' => $root->getAttribute('Total'),
            'total_letra' => $this->amountToWords($root->getAttribute('Total'), $root->getAttribute('Moneda')),
            'sello_cfd' => $root->getAttribute('Sello'),
            'forma_pago' => $root->getAttribute('FormaPago'),
            'metodo_pago' => $root->getAttribute('MetodoPago'),
        ];

        $emisor = $xpath->query("//$ns:Emisor")->item(0);
        $data['emisor'] = ['rfc' => $emisor ? $emisor->getAttribute('Rfc') : '', 'nombre' => $emisor ? $emisor->getAttribute('Nombre') : '', 'regimen' => $emisor ? $emisor->getAttribute('RegimenFiscal') : ''];
        $receptor = $xpath->query("//$ns:Receptor")->item(0);
        $data['receptor'] = ['rfc' => $receptor ? $receptor->getAttribute('Rfc') : '', 'nombre' => $receptor ? $receptor->getAttribute('Nombre') : '', 'uso' => $receptor ? $receptor->getAttribute('UsoCFDI') : '', 'regimen' => $receptor ? $receptor->getAttribute('RegimenFiscalReceptor') : '', 'domicilio' => $receptor ? $receptor->getAttribute('DomicilioFiscalReceptor') : ''];

        $data['conceptos'] = [];
        foreach ($xpath->query("//$ns:Conceptos/$ns:Concepto") as $con) {
            $data['conceptos'][] = ['cantidad' => $con->getAttribute('Cantidad'), 'clave_unit' => $con->getAttribute('ClaveUnidad'), 'unidad' => $con->getAttribute('Unidad'), 'clave_prod_serv' => $con->getAttribute('ClaveProdServ'), 'descripcion' => $con->getAttribute('Descripcion'), 'no_identificacion' => $con->getAttribute('NoIdentificacion'), 'valor_unitario' => $con->getAttribute('ValorUnitario'), 'importe' => $con->getAttribute('Importe')];
        }

        $data['traslados'] = [];
        foreach ($xpath->query("/*/$ns:Impuestos/$ns:Traslados/$ns:Traslado") as $tras) {
            $data['traslados'][] = ['impuesto' => $tras->getAttribute('Impuesto'), 'tasa' => $tras->getAttribute('TasaOCuota'), 'importe' => $tras->getAttribute('Importe')];
        }

        $data['retenciones'] = [];
        foreach ($xpath->query("/*/$ns:Impuestos/$ns:Retenciones/$ns:Retencion") as $ret) {
            $data['retenciones'][] = ['impuesto' => $ret->getAttribute('Impuesto'), 'importe' => $ret->getAttribute('Importe')];
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
            $data['qrCode'] = base64_encode(\SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')->size(300)->margin(0)->generate($qrString));
        }
        catch (\Throwable $e) {
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

        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.cfdi', ['cfdis' => $allCfdis]);
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
        return response()->json($service->syncIfNeeded(\App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail()));
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
}
