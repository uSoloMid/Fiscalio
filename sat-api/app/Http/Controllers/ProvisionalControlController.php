<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use App\Models\Cfdi;
use Throwable;

class ProvisionalControlController extends Controller
{
    public function exportExcel(Request $request)
    {
        try {
            $rfc = (string)$request->query('rfc');
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');

            $summaryResponse = $this->getSummary($request);
            $data = json_decode($summaryResponse->getContent(), true);

            $xml = '<?xml version="1.0"?>';
            $xml .= '<?mso-application progid="Excel.Sheet"?>';
            $xml .= '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">';

            // Styles
            $xml .= '<Styles>';
            $xml .= '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Borders/><Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/><Interior/><NumberFormat/><Protection/></Style>';
            $xml .= '<Style ss:ID="Header"><Font ss:FontName="Calibri" ss:Size="12" ss:Color="#FFFFFF" ss:Bold="1"/><Interior ss:Color="#10B981" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>';
            $xml .= '<Style ss:ID="SubHeader"><Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/><Interior ss:Color="#374151" ss:Pattern="Solid"/></Style>';
            $xml .= '<Style ss:ID="Currency"><NumberFormat ss:Format="&quot;$&quot;#,##0.00"/></Style>';
            $xml .= '<Style ss:ID="Bold"><Font ss:Bold="1"/></Style>';
            $xml .= '</Styles>';

            // Sheet 1: Resumen
            $xml .= '<Worksheet ss:Name="Resumen Fiscal">';
            $xml .= '<Table>';
            $xml .= '<Column ss:Width="150"/><Column ss:Width="100"/><Column ss:Width="100"/><Column ss:Width="100"/><Column ss:Width="120"/><Column ss:Width="100"/>';

            $xml .= '<Row><Cell ss:StyleID="Header" ss:MergeAcross="5"><Data ss:Type="String">CONTROL PROVISIONAL - ' . $rfc . ' (' . $month . '/' . $year . ')</Data></Cell></Row>';
            $xml .= '<Row/>';

            // Ingresos Table
            $xml .= '<Row><Cell ss:StyleID="SubHeader" ss:MergeAcross="5"><Data ss:Type="String">INGRESOS</Data></Cell></Row>';
            $xml .= '<Row><Cell ss:StyleID="Bold"><Data ss:Type="String">Concepto</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">PUE</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">PPD</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">REP</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Suma Efectivo</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Pendiente</Data></Cell></Row>';

            $rows = ['subtotal' => 'Base Gravable', 'iva' => 'IVA Facturado', 'retenciones' => 'Retenciones', 'total' => 'Total Facturado'];
            foreach ($rows as $key => $label) {
                $r = $data['ingresos'][$key];
                $xml .= '<Row>';
                $xml .= '<Cell><Data ss:Type="String">' . $label . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['pue'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['ppd'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['rep'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['suma_efectivo'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['pendiente'] . '</Data></Cell>';
                $xml .= '</Row>';
            }

            $xml .= '<Row/>';
            // Egresos Table
            $xml .= '<Row><Cell ss:StyleID="SubHeader" ss:MergeAcross="5" style="background-color: #2563EB"><Data ss:Type="String">EGRESOS</Data></Cell></Row>';
            foreach ($rows as $key => $label) {
                if ($key === 'subtotal')
                    $label = 'Base Deducible';
                if ($key === 'iva')
                    $label = 'IVA Acreditable';
                $r = $data['egresos'][$key];
                $xml .= '<Row>';
                $xml .= '<Cell><Data ss:Type="String">' . $label . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['pue'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['ppd'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['rep'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['suma_efectivo'] . '</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $r['pendiente'] . '</Data></Cell>';
                $xml .= '</Row>';
            }

            $xml .= '</Table></Worksheet>';

            // Sheet 2: Detalle Ingresos
            $xml .= '<Worksheet ss:Name="Detalle Ingresos">';
            $xml .= '<Table>';
            $xml .= '<Row><Cell ss:StyleID="Header" ss:MergeAcross="5"><Data ss:Type="String">DETALLE DE INGRESOS (PUE + REP)</Data></Cell></Row>';
            $xml .= '<Row><Cell ss:StyleID="Bold"><Data ss:Type="String">Fecha</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">RFC/Nombre</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">UUID</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Metodo</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Subtotal</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">IVA</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Total</Data></Cell></Row>';

            $buckets = ['ingresos_total_pue', 'ingresos_total_rep'];
            foreach ($buckets as $b) {
                $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = $this->getBucketDetails($req)->original;
                foreach ($items as $item) {
                    $xml .= '<Row>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['fecha'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['nombre'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['uuid'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['metodo_pago'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['subtotal'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['iva'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['total'] . '</Data></Cell>';
                    $xml .= '</Row>';
                }
            }
            $xml .= '</Table></Worksheet>';

            // Sheet 3: Detalle Egresos
            $xml .= '<Worksheet ss:Name="Detalle Egresos">';
            $xml .= '<Table>';
            $xml .= '<Row><Cell ss:StyleID="Header" ss:MergeAcross="5"><Data ss:Type="String">DETALLE DE EGRESOS DEDUCIBLES</Data></Cell></Row>';
            $xml .= '<Row><Cell ss:StyleID="Bold"><Data ss:Type="String">Fecha</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">RFC/Nombre</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">UUID</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Metodo</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Subtotal</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">IVA</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Total</Data></Cell></Row>';

            $buckets = ['egresos_total_pue', 'egresos_total_rep'];
            foreach ($buckets as $b) {
                $req = new Request(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = $this->getBucketDetails($req)->original;
                foreach ($items as $item) {
                    if (!($item['is_deductible'] ?? true))
                        continue;
                    $xml .= '<Row>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['fecha'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['nombre'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['uuid'] . '</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">' . $item['metodo_pago'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['subtotal'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['iva'] . '</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">' . $item['total'] . '</Data></Cell>';
                    $xml .= '</Row>';
                }
            }
            $xml .= '</Table></Worksheet>';

            $xml .= '</Workbook>';

            return response($xml, 200)
                ->header('Content-Type', 'application/vnd.ms-excel')
                ->header('Content-Disposition', 'attachment; filename="ControlProvisional_' . $rfc . '_' . $month . '_' . $year . '.xls"');

        }
        catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportPdfSummary(Request $request)
    {
        try {
            $rfc = (string)$request->query('rfc');
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');

            $summaryResponse = $this->getSummary($request);
            $data = json_decode($summaryResponse->getContent(), true);

            $client = DB::table('businesses')->where('rfc', $rfc)->first();
            $clientName = $client ? $client->name : $rfc;

            $months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            $periodName = $months[$month - 1];

            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('reports.provisional_summary', [
                'data' => $data,
                'rfc' => $rfc,
                'clientName' => $clientName,
                'year' => $year,
                'month' => $month,
                'periodName' => $periodName
            ]);

            return $pdf->download("ResumenProvisional_{$rfc}_{$month}_{$year}.pdf");
        }
        catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportDetailedBucketPdf(Request $request)
    {
        try {
            $rfc = (string)$request->query('rfc');
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');
            $bucket = (string)$request->query('bucket');

            $items = $this->getBucketDetails($request)->original;

            $client = DB::table('businesses')->where('rfc', $rfc)->first();
            $clientName = $client ? $client->name : $rfc;

            $months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            $periodName = $months[$month - 1];

            // Reusing the same logic for a simple detailed list
            $html = "<h1>Detalle: " . strtoupper(str_replace('_', ' ', $bucket)) . "</h1>";
            $html .= "<h3>Cliente: $clientName ($rfc) | Periodo: $periodName $year</h3>";
            $html .= "<table border='1' width='100%' style='border-collapse:collapse; font-size:10px;'>";
            $html .= "<thead><tr><th>Fecha</th><th>Nombre</th><th>UUID</th><th>Metodo</th><th>Subtotal</th><th>IVA</th><th>Total</th></tr></thead>";
            $html .= "<tbody>";
            foreach ($items as $item) {
                $html .= "<tr>";
                $html .= "<td>{$item['fecha']}</td>";
                $html .= "<td>{$item['nombre']}</td>";
                $html .= "<td>{$item['uuid']}</td>";
                $html .= "<td>{$item['metodo_pago']}</td>";
                $html .= "<td>$ " . number_format($item['subtotal'], 2) . "</td>";
                $html .= "<td>$ " . number_format($item['iva'], 2) . "</td>";
                $html .= "<td>$ " . number_format($item['total'], 2) . "</td>";
                $html .= "</tr>";
            }
            $html .= "</tbody></table>";

            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);
            return $pdf->download("Detalle_{$bucket}_{$rfc}_{$month}_{$year}.pdf");

        }
        catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
