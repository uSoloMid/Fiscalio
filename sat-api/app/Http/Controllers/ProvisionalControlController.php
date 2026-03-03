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
    public function getSummary(Request $request)
    {
        try {
            $rfc = trim(strtoupper((string)$request->query('rfc')));

            $year = (int)$request->query('year');
            $month = (int)$request->query('month');

            if (!$rfc || !$year || !$month) {
                                        return response()->json(['error' => 'Missing parameters'], 400);
            }

            $strMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
            $startDate = "{$year}-{$strMonth}-01 00:00:00";
            $carbonEnd = Carbon::createFromDate($year, $month, 1)->endOfMonth();
            $endDate = $carbonEnd->format('Y-m-d 23:59:59');

            $alertas = $this->calculateAlerts($rfc, $startDate, $endDate);
            $this->performAudit($rfc, $startDate, $endDate);

            $tcSql = "CASE WHEN moneda = 'MXN' OR moneda IS NULL THEN 1 ELSE COALESCE(NULLIF(tipo_cambio, 0), 1) END";

            $getInvoicesSum = function ($direction, $metodo, $onlyDeductible = true) use ($rfc, $startDate, $endDate, $tcSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $query = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->whereIn('metodo_pago', [$metodo, $metodo . ' '])
                    ->where('es_cancelado', false)
                    ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN '{$startDate}' AND '{$endDate}'");
                
                if ($direction === 'egresos') {
                    if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('is_deductible', '!=', 0)
                          ->orWhereNull('is_deductible');
                    });
                } else {
                        $query->where('is_deductible', 0);
                    }
                }

                return $query->select(
                        DB::raw("SUM(subtotal * $tcSql) as subtotal"),
                        DB::raw("SUM(iva * $tcSql) as iva"),
                        DB::raw("SUM(retenciones * $tcSql) as retenciones"),
                        DB::raw("SUM(total * $tcSql) as total")
                    )->first();
            };

            $getRepSum = function($direction, $onlyDeductible = true) use ($rfc, $startDate, $endDate) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $tcPago = "COALESCE(NULLIF(cfdi_payments.tipo_cambio_pago, 0), 1)";

                $query = DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $field, $rfc)
                    ->where('reps.es_cancelado', false)
                    ->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate]);

                if ($direction === 'egresos') {
                    if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('ppds.is_deductible', '!=', 0)
                          ->orWhereNull('ppds.is_deductible');
                    });
                } else {
                        $query->where('ppds.is_deductible', 0);
                    }
                }

                return $query->select(
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.subtotal / NULLIF(ppds.total, 0)) * $tcPago) as subtotal"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.iva / NULLIF(ppds.total, 0)) * $tcPago) as iva"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.retenciones / NULLIF(ppds.total, 0)) * $tcPago) as retenciones"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * $tcPago) as total")
                    )->first();
            };

            $getPendSum = function($direction, $onlyDeductible = true) use ($rfc, $startDate, $endDate) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $query = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', 'PPD')
                    ->where('es_cancelado', false)
                    ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN '{$startDate}' AND '{$endDate}'");

                if ($direction === 'egresos') {
                    if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('is_deductible', '!=', 0)
                          ->orWhereNull('is_deductible');
                    });
                } else {
                        $query->where('is_deductible', 0);
                    }
                }

                $invoices = $query->get();

                $res = ['subtotal' => 0, 'iva' => 0, 'retenciones' => 0, 'total' => 0];
                foreach ($invoices as $c) {
                    $moneda = strtoupper($c->moneda ?? 'MXN');
                    $tc = ($moneda === 'MXN') ? 1.0 : (float)($c->tipo_cambio ?? 1);
                    if ($tc <= 0) $tc = 1.0;

                    $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                    $balance = max(0, (float)$c->total - (float)$pagado);
                    if ($balance < 0.05) continue;
                    $ratio = $c->total > 0 ? ($balance / (float)$c->total) : 0;
                    
                    $res['subtotal'] += (float)$c->subtotal * $ratio * $tc;
                    $res['iva'] += (float)$c->iva * $ratio * $tc;
                    $res['retenciones'] += (float)$c->retenciones * $ratio * $tc;
                    $res['total'] += (float)$c->total * $ratio * $tc;
                }
                return $res;
            };

            $ingPue = $getInvoicesSum('ingresos', 'PUE');
            $ingPpd = $getInvoicesSum('ingresos', 'PPD');
            $ingRep = $getRepSum('ingresos');
            $ingPend = $getPendSum('ingresos');

            $egrPue = $getInvoicesSum('egresos', 'PUE', true);
            $egrPpd = $getInvoicesSum('egresos', 'PPD', true);
            $egrRep = $getRepSum('egresos', true);
            $egrPend = $getPendSum('egresos', true);

            $ndPue = $getInvoicesSum('egresos', 'PUE', false);
            $ndPpd = $getInvoicesSum('egresos', 'PPD', false);
            $ndRep = $getRepSum('egresos', false);
            $ndPend = $getPendSum('egresos', false);

            $totalEfectivoIng = (float)($ingPue?->total ?? 0) + (float)($ingRep?->total ?? 0);
            $totalEfectivoEgr = (float)($egrPue?->total ?? 0) + (float)($egrRep?->total ?? 0);

            $formatRow = function($pue, $ppd, $rep, $pend, $field) {
                $vP = (float)($pue?->$field ?? 0); 
                $vD = (float)($ppd?->$field ?? 0); 
                $vR = (float)($rep?->$field ?? 0); 
                $vN = (float)($pend[$field] ?? 0);
                return ['pue' => $vP, 'ppd' => $vD, 'rep' => $vR, 'suma_devengado' => $vP + $vD, 'suma_efectivo' => $vP + $vR, 'pendiente' => $vN];
            };

                        return response()->json([
                'ingresos' => [
                    'total_efectivo' => $totalEfectivoIng,
                    'subtotal' => $formatRow($ingPue, $ingPpd, $ingRep, $ingPend, 'subtotal'),
                    'iva' => $formatRow($ingPue, $ingPpd, $ingRep, $ingPend, 'iva'),
                    'retenciones' => $formatRow($ingPue, $ingPpd, $ingRep, $ingPend, 'retenciones'),
                    'total' => $formatRow($ingPue, $ingPpd, $ingRep, $ingPend, 'total'),
                ],
                'egresos' => [
                    'total_efectivo' => $totalEfectivoEgr,
                    'subtotal' => $formatRow($egrPue, $egrPpd, $egrRep, $egrPend, 'subtotal'),
                    'iva' => $formatRow($egrPue, $egrPpd, $egrRep, $egrPend, 'iva'),
                    'retenciones' => $formatRow($egrPue, $egrPpd, $egrRep, $egrPend, 'retenciones'),
                    'total' => $formatRow($egrPue, $egrPpd, $egrRep, $egrPend, 'total'),
                ],
                'no_deducibles' => [
                    'total_efectivo' => (float)($ndPue?->total ?? 0) + (float)($ndRep?->total ?? 0),
                    'total_pendiente' => (float)($ndPend['total'] ?? 0),
                    'subtotal' => $formatRow($ndPue, $ndPpd, $ndRep, $ndPend, 'subtotal'),
                    'total' => $formatRow($ndPue, $ndPpd, $ndRep, $ndPend, 'total'),
                ],
                'alertas' => $alertas
            ]);
        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getBucketDetails(Request $request)
    {
        try {
            $rfc = strtoupper((string)$request->query('rfc'));
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');
            $bucket = (string)$request->query('bucket'); 
            
            $strMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
            $startDate = "{$year}-{$strMonth}-01 00:00:00";
            $carbonEnd = Carbon::createFromDate($year, $month, 1)->endOfMonth();
            $endDate = $carbonEnd->format('Y-m-d 23:59:59');

            $parts = explode('_', $bucket);
            if (count($parts) < 2) return response()->json([]);
            
            $dir = $parts[0]; 
            $cat = $parts[1]; 
            $metodo = count($parts) >= 3 ? trim(strtoupper($parts[2])) : null;
            
            $fieldRfc = ($dir === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
            $onlyNonDeductible = ($dir === 'egresos' && $cat === 'nodeducibles');
            // En egresos, mostramos todo en las cubetas normales para gestión, 
            // pero filtramos estrictamente en la de nodeducibles.
            $onlyDeductible = ($dir === 'egresos' && $cat !== 'nodeducibles'); 

            $results = collect();

            if (!$metodo || $metodo === 'PUE' || $metodo === 'PPD' || $metodo === 'PAGADOS') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('es_cancelado', false)->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN '{$startDate}' AND '{$endDate}'");
                if ($metodo === 'PUE' || $metodo === 'PPD') {
                    $query->whereIn('metodo_pago', [$metodo, $metodo . ' ']);
                } elseif ($metodo === 'PAGADOS') {
                    $query->where('metodo_pago', 'PUE'); // Solo PUE, omitir PPD
                } else {
                    $query->whereIn('metodo_pago', ['PUE', 'PPD']);
                }

                if ($onlyNonDeductible) {
                    $query->where('is_deductible', 0);
                }
                if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('is_deductible', '!=', 0)
                          ->orWhereNull('is_deductible');
                    });
                }

                $resInvoices = $query->get()->map(function($c) use ($dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    return [
                        'uuid' => $c->uuid, 'fecha' => substr($c->fecha_fiscal, 0, 10), 'nombre' => $nombre,
                        'subtotal' => (float)$c->subtotal * $tc, 'iva' => (float)($c->iva ?? 0) * $tc,
                        'total' => (float)$c->total * $tc, 'metodo_pago' => $c->metodo_pago,
                        'forma_pago' => $c->forma_pago, 'is_deductible' => (bool)($c->is_deductible ?? true), 
                        'uso_cfdi' => $c->uso_cfdi ?? 'G03',
                        'warning' => $this->getWarningForCfdi($c),
                        'reason' => $this->getReasonFriendly($c->deduction_type)
                    ];
                });
                $results = $results->concat($resInvoices);
            }

            if (!$metodo || $metodo === 'REP' || $metodo === 'PAGADOS') {
                $query = DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $fieldRfc, $rfc)->where('reps.es_cancelado', false)->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate]);

                if ($onlyNonDeductible) {
                    $query->where('ppds.is_deductible', 0);
                }
                if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('ppds.is_deductible', '!=', 0)
                          ->orWhereNull('ppds.is_deductible');
                    });
                }

                $resReps = $query->select('cfdi_payments.*', 'reps.forma_pago as rep_forma_pago', 'ppds.name_receptor', 'ppds.name_emisor', 'ppds.subtotal as ppd_sub', 'ppds.iva as ppd_iva', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc', 'ppds.is_deductible', 'ppds.uso_cfdi', 'ppds.concepto', 'ppds.deduction_type')
                    ->get()->map(function($p) use ($dir) {
                        $ratio = $p->ppd_tot > 0 ? ($p->monto_pagado / $p->ppd_tot) : 0;
                        $tc = (strtoupper($p->ppd_mon ?? 'MXN') === 'MXN') ? 1 : ($p->ppd_tc ?: 1);
                        $nombre = ($dir === 'ingresos') ? $p->name_receptor : $p->name_emisor;
                        
                        // Preparar objeto para validación de warning
                        $auditObj = (object)[
                            'metodo_pago' => 'REP',
                            'forma_pago' => $p->rep_forma_pago,
                            'total' => $p->monto_pagado,
                            'concepto' => $p->concepto,
                            'uso_cfdi' => $p->uso_cfdi
                        ];

                        return [
                            'uuid' => $p->uuid_pago, 'fecha' => substr($p->fecha_pago, 0, 10), 'nombre' => $nombre,
                            'subtotal' => (float)($p->ppd_sub ?? 0) * $ratio * $tc, 'iva' => (float)($p->ppd_iva ?? 0) * $ratio * $tc,
                            'total' => (float)$p->monto_pagado, 'metodo_pago' => 'REP', 'forma_pago' => $p->rep_forma_pago ?? '99', 
                            'is_deductible' => (bool)($p->is_deductible ?? true), 'uso_cfdi' => $p->uso_cfdi ?? 'G03',
                            'warning' => $this->getWarningForCfdi($auditObj),
                            'reason' => $this->getReasonFriendly($p->deduction_type ?? null)
                        ];
                    });
                $results = $results->concat($resReps);
            }

            if (!$metodo || $metodo === 'PENDIENTE') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')->where('es_cancelado', false)->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN '{$startDate}' AND '{$endDate}'");
                if ($onlyNonDeductible) {
                    $query->where('is_deductible', 0);
                }
                if ($onlyDeductible) {
                    $query->where(function($q) {
                        $q->where('is_deductible', '!=', 0)
                          ->orWhereNull('is_deductible');
                    });
                }

                $resPend = $query->get()->map(function($c) use ($endDate, $dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                    $bal = max(0, (float)$c->total - (float)$pagado);
                    if ($bal < 0.05) return null;
                    $ratio = $c->total > 0 ? ($bal / (float)$c->total) : 0;
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    return [
                        'uuid' => $c->uuid, 'fecha' => substr($c->fecha_fiscal, 0, 10), 'nombre' => $nombre,
                        'subtotal' => (float)$c->subtotal * $ratio * $tc, 'iva' => (float)($c->iva ?? 0) * $tc,
                        'total' => $bal * $tc, 'metodo_pago' => $c->metodo_pago, 
                        'is_deductible' => (bool)($c->is_deductible ?? true), 'uso_cfdi' => $c->uso_cfdi ?? 'G03', 
                        'forma_pago' => $c->forma_pago,
                        'warning' => $this->getWarningForCfdi($c),
                        'reason' => $this->getReasonFriendly($c->deduction_type)
                    ];
                })->filter()->values();
                $results = $results->concat($resPend);
            }

            return response()->json($results->values());
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function updateDeductibility($uuid, Request $request)
    {
        try {
            $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();
            $cfdi->update(['is_deductible' => $request->input('is_deductible'), 'deduction_type' => $request->input('deduction_type', $cfdi->deduction_type)]);
                        return response()->json(['ok' => true]);
        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getPpdExplorer(Request $request)
    {
        try {
            $rfc = $request->query('rfc');
            $tipo = $request->query('tipo');
            $year = $request->query('year');
            $month = $request->query('month');

            $field = ($tipo === 'issued') ? 'rfc_emisor' : 'rfc_receptor';
            $query = DB::table('cfdis')
                ->where($field, $rfc)
                ->where('tipo', 'I')
                ->where('metodo_pago', 'PPD')
                ->where('es_cancelado', false)
                ->whereYear('fecha_fiscal', $year)
                ->whereMonth('fecha_fiscal', $month);

            $results = $query->get()->map(function($c) {
                $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->sum('monto_pagado');
                $c->monto_pagado = (float)$pagado;
                $c->saldo_pendiente = (float)$c->total - (float)$pagado;
                $c->status_pago = $c->saldo_pendiente <= 0.05 ? 'Liquidada' : ($pagado > 0 ? 'Parcial' : 'Pendiente');
                return $c;
            });

                        return response()->json(['data' => $results]);
        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getRepExplorer(Request $request)
    {
        try {
            $rfc = $request->query('rfc');
            $tipo = $request->query('tipo');
            $year = $request->query('year');
            $month = $request->query('month');

            $field = ($tipo === 'issued') ? 'rfc_emisor' : 'rfc_receptor';
            $query = DB::table('cfdis')
                ->where($field, $rfc)
                ->where('tipo', 'P')
                ->where('es_cancelado', false)
                ->whereYear('fecha', $year)
                ->whereMonth('fecha', $month);

            $results = $query->get()->map(function($c) {
                $relacionados = DB::table('cfdi_payments')
                    ->where('uuid_pago', $c->uuid)
                    ->get();
                $c->relacionados = $relacionados;
                return $c;
            });

                        return response()->json(['data' => $results]);
        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportExcel(Request $request)
    {
        try {
            $rfc = strtoupper((string)$request->query('rfc'));
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
            foreach($rows as $key => $label) {
                $r = $data['ingresos'][$key];
                $xml .= '<Row>';
                $xml .= '<Cell><Data ss:Type="String">'.$label.'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['pue'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['ppd'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['rep'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['suma_efectivo'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['pendiente'].'</Data></Cell>';
                $xml .= '</Row>';
            }
            
            $xml .= '<Row/>';
            // Egresos Table
            $xml .= '<Row><Cell ss:StyleID="SubHeader" ss:MergeAcross="5" style="background-color: #2563EB"><Data ss:Type="String">EGRESOS</Data></Cell></Row>';
            foreach($rows as $key => $label) {
                if($key === 'subtotal') $label = 'Base Deducible';
                if($key === 'iva') $label = 'IVA Acreditable';
                $r = $data['egresos'][$key];
                $xml .= '<Row>';
                $xml .= '<Cell><Data ss:Type="String">'.$label.'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['pue'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['ppd'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['rep'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['suma_efectivo'].'</Data></Cell>';
                $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$r['pendiente'].'</Data></Cell>';
                $xml .= '</Row>';
            }
            
            $xml .= '</Table></Worksheet>';

            // Sheet 2: Detalle Ingresos
            $xml .= '<Worksheet ss:Name="Detalle Ingresos">';
            $xml .= '<Table>';
            $xml .= '<Row><Cell ss:StyleID="Header" ss:MergeAcross="5"><Data ss:Type="String">DETALLE DE INGRESOS (PUE + REP)</Data></Cell></Row>';
            $xml .= '<Row><Cell ss:StyleID="Bold"><Data ss:Type="String">Fecha</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">RFC/Nombre</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">UUID</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Metodo</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Subtotal</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">IVA</Data></Cell><Cell ss:StyleID="Bold"><Data ss:Type="String">Total</Data></Cell></Row>';
            
            $buckets = ['ingresos_total_pue', 'ingresos_total_rep'];
            foreach($buckets as $b) {
                $req = new Request(); $req->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = $this->getBucketDetails($req)->original;
                foreach($items as $item) {
                    $xml .= '<Row>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['fecha'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['nombre'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['uuid'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['metodo_pago'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['subtotal'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['iva'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['total'].'</Data></Cell>';
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
            foreach($buckets as $b) {
                $req = new Request(); $req->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = $this->getBucketDetails($req)->original;
                foreach($items as $item) {
                    if(!($item['is_deductible'] ?? true)) continue;
                    $xml .= '<Row>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['fecha'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['nombre'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['uuid'].'</Data></Cell>';
                    $xml .= '<Cell><Data ss:Type="String">'.$item['metodo_pago'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['subtotal'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['iva'].'</Data></Cell>';
                    $xml .= '<Cell ss:StyleID="Currency"><Data ss:Type="Number">'.$item['total'].'</Data></Cell>';
                    $xml .= '</Row>';
                }
            }
            $xml .= '</Table></Worksheet>';

            $xml .= '</Workbook>';

            return response($xml, 200)
                ->header('Content-Type', 'application/vnd.ms-excel')
                ->header('Content-Disposition', 'attachment; filename="ControlProvisional_'.$rfc.'_'.$month.'_'.$year.'.xls"');

        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportPdfSummary(Request $request)
    {
        try {
            $rfc = strtoupper((string)$request->query('rfc'));
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');

            $summaryResponse = $this->getSummary($request);
            $data = json_decode($summaryResponse->getContent(), true);

            // Fetch details to include in the PDF with correct keys for the blade view
            $details = [
                'ingresos_considerados' => collect(),
                'egresos_considerados' => collect(),
                'ingresos_pendientes' => collect(),
                'egresos_pendientes' => collect(),
                'no_deducibles' => collect(),
            ];

            // 1. Ingresos Considerados (PUE + REP)
            foreach(['ingresos_total_pue', 'ingresos_total_rep'] as $b) {
                $req = new Request(); $req->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['ingresos_considerados'] = $details['ingresos_considerados']->concat($items);
            }

            // 2. Egresos Considerados (PUE + REP + PPD Pagados)
            foreach(['egresos_total_pue', 'egresos_total_ppd', 'egresos_total_rep'] as $b) {
                $req = new Request(); $req->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['egresos_considerados'] = $details['egresos_considerados']->concat($items);
            }

            // 3. No Deducibles
            foreach(['egresos_nodeducibles_pue', 'egresos_nodeducibles_ppd', 'egresos_nodeducibles_rep'] as $b) {
                $req = new Request(); $req->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => $b]);
                $items = collect($this->getBucketDetails($req)->original);
                $details['no_deducibles'] = $details['no_deducibles']->concat($items);
            }

            // 4. Pendientes (CXC / CXP)
            $reqI = new Request(); $reqI->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'ingresos_total_pendiente']);
            $itemsI = $this->getBucketDetails($reqI)->original;
            $details['ingresos_pendientes'] = collect($itemsI);

            $reqE = new Request(); $reqE->query->add(['rfc' => $rfc, 'year' => $year, 'month' => $month, 'bucket' => 'egresos_total_pendiente']);
            $itemsE = $this->getBucketDetails($reqE)->original;
            $details['egresos_pendientes'] = collect($itemsE);

            $client = DB::table('businesses')->where('rfc', $rfc)->first();
            $clientName = $client ? ($client->name ?? $client->common_name) : $rfc;

            $months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            $periodName = $months[$month - 1];

            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('reports.provisional_summary', [
                'data' => $data,
                'details' => $details,
                'rfc' => $rfc,
                'clientName' => $clientName,
                'year' => $year,
                'month' => $month,
                'periodName' => $periodName
            ]);

            return $pdf->download("Reporte_Provisional_{$rfc}_{$month}_{$year}.pdf");
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()], 500);
        }
    }
    public function exportDetailedBucketPdf(Request $request)
    {
        try {
            $rfc = strtoupper((string)$request->query('rfc'));
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');
            $bucket = (string)$request->query('bucket');

            $items = $this->getBucketDetails($request)->original;

            $client = DB::table('businesses')->where('rfc', $rfc)->first();
            $clientName = $client ? ($client->legal_name ?? $client->common_name ?? $rfc) : $rfc;

            $months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
            $periodName = $months[$month - 1];

            $html = "<h1>Detalle: " . strtoupper(str_replace('_', ' ', $bucket)) . "</h1>";
            $html .= "<h3>Cliente: $clientName ($rfc) | Periodo: $periodName $year</h3>";
            $html .= "<table border='1' width='100%' style='border-collapse:collapse; font-size:10px;'>";
            $html .= "<thead><tr><th>Fecha</th><th>Nombre</th><th>UUID</th><th>Metodo</th><th>Subtotal</th><th>IVA</th><th>Total</th></tr></thead>";
            $html .= "<tbody>";
            foreach($items as $item) {
                $html .= "<tr>";
                $html .= "<td>{$item['fecha']}</td>";
                $html .= "<td>{$item['nombre']}</td>";
                $html .= "<td>{$item['uuid']}</td>";
                $html .= "<td>{$item['metodo_pago']}</td>";
                $html .= "<td>$ ".number_format($item['subtotal'], 2)."</td>";
                $html .= "<td>$ ".number_format($item['iva'], 2)."</td>";
                $html .= "<td>$ ".number_format($item['total'], 2)."</td>";
                $html .= "</tr>";
            }
            $html .= "</tbody></table>";

            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadHTML($html);
            return $pdf->download("Detalle_{$bucket}_{$rfc}_{$month}_{$year}.pdf");

        } catch (Throwable $e) {
                        return response()->json(['error' => $e->getMessage()], 500);
        }
    
        }

    private function calculateAlerts($rfc, $startDate, $endDate)
    {
        $alerts = [];
        $rfc = trim($rfc);
        
        // 1. Alerta de Deducciones en Efectivo > $2,000
        $resultsCount = \DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->whereIn('metodo_pago', ['PUE', 'PUE '])
            ->whereIn('forma_pago', ['01', '1', '01 ']) 
            ->where('total', '>', 2000)
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->count();
            
        if ($resultsCount > 0) {
            $alerts[] = [
                'type' => 'danger',
                'title' => 'Deducciones en Efectivo > $2,000',
                'message' => "Se detectaron $resultsCount facturas PUE pagadas en efectivo con importe mayor a $2,000. Estas no cumplen con los requisitos de forma para ser deducibles."
            ];
        }

        // 2. Alerta de Combustible en Efectivo
        $fuelCash = \DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->whereIn('forma_pago', ['01', '1', '01 '])
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->where(function($q) {
                $q->where('concepto', 'like', '%GASOLINA%')
                  ->orWhere('concepto', 'like', '%COMBUSTIBLE%')
                  ->orWhere('concepto', 'like', '%DIESEL%')
                  ->orWhere('concepto', 'like', '%MAGNA%')
                  ->orWhere('concepto', 'like', '%PREMIUM%');
            })
            ->count();

        if ($fuelCash > 0) {
            $alerts[] = [
                'type' => 'danger',
                'title' => 'Combustible en Efectivo',
                'message' => "Se detectaron $fuelCash facturas de combustible pagadas en efectivo. La ley del ISR exige que el combustible se pague siempre con medios electrónicos para ser deducible."
            ];
        }

        // 3. Alerta de Deducciones Personales
        $personalesCount = \DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->where('uso_cfdi', 'like', 'D%')
            ->count();

        if ($personalesCount > 0) {
            $alerts[] = [
                'type' => 'warning',
                'title' => 'Deducciones Personales Detectadas',
                'message' => "Se detectaron $personalesCount facturas con Uso de CFDI tipo 'D' (Honorarios médicos, dentales, etc.). Estas se han marcado automáticamente como gastos no deducibles para el cálculo provisional, pero serán útiles en la Declaración Anual."
            ];
        }

        // 4. Alerta de REPs en Efectivo
        $cashRepsCount = \DB::table('cfdi_payments')
            ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
            ->where('reps.rfc_receptor', $rfc)
            ->whereIn('reps.forma_pago', ['01', '1', '01 '])
            ->where('reps.es_cancelado', false)
            ->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate])
            ->count();

        if ($cashRepsCount > 0) {
            $alerts[] = [
                'type' => 'danger',
                'title' => 'Complementos de Pago en Efectivo',
                'message' => "Se detectaron $cashRepsCount complementos de pago (REP) liquidados en efectivo. Si la factura relacionada es mayor a $2,000 o es combustible, el gasto no es deducible."
            ];
        }

        return $alerts;
    }
    private function performAudit($rfc, $startDate, $endDate)
    {
        Log::info("Iniciando auditoria para RFC: $rfc | Periodo: $startDate - $endDate");

        $rfc = trim($rfc);

        // 1. Marcar efectivo > 2000 como no deducible (PUE)
        $res1 = Cfdi::where('rfc_receptor', $rfc)
            ->whereIn('metodo_pago', ['PUE', 'PUE '])
            ->whereIn('forma_pago', ['01', '1', '01 ']) 
            ->where('total', '>', 2000)
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->where(function($q) {
                $q->whereNull('deduction_type')
                  ->orWhere('deduction_type', '!=', 'manual');
            })
            ->update(['is_deductible' => 0, 'deduction_type' => 'auto_cash_gt_2000']);

        // 2. Marcar combustible en efectivo
        $res2 = Cfdi::where('rfc_receptor', $rfc)
            ->whereIn('forma_pago', ['01', '1', '01 '])
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->where(function($q) {
                $q->whereNull('deduction_type')
                  ->orWhere('deduction_type', '!=', 'manual');
            })
            ->where(function($q) {
                $q->where('concepto', 'like', '%GASOLINA%')
                  ->orWhere('concepto', 'like', '%COMBUSTIBLE%')
                  ->orWhere('concepto', 'like', '%DIESEL%')
                  ->orWhere('concepto', 'like', '%MAGNA%')
                  ->orWhere('concepto', 'like', '%PREMIUM%');
            })
            ->update(['is_deductible' => 0, 'deduction_type' => 'auto_fuel_cash']);

        // 3. Marcar deducciones personales
        $res3 = Cfdi::where('rfc_receptor', $rfc)
            ->where('es_cancelado', false)
            ->whereRaw("COALESCE(fecha_fiscal, fecha) BETWEEN ? AND ?", [$startDate, $endDate])
            ->where('uso_cfdi', 'like', 'D%')
            ->where(function($q) {
                $q->whereNull('deduction_type')
                  ->orWhere('deduction_type', '!=', 'manual');
            })
            ->update(['is_deductible' => 0, 'deduction_type' => 'auto_personal_deduction']);

        // 4. Marcar REPs pagados en efectivo (Deducción no válida para PPD relacionado)
        $cashReps = DB::table('cfdi_payments')
            ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
            ->where('reps.rfc_receptor', $rfc)
            ->whereIn('reps.forma_pago', ['01', '1', '01 '])
            ->where('reps.es_cancelado', false)
            ->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate])
            ->pluck('cfdi_payments.uuid_relacionado')
            ->unique();

        $res4 = 0;
        if ($cashReps->count() > 0) {
            $res4 = Cfdi::whereIn('uuid', $cashReps)
                ->where(function($q) {
                    $q->whereNull('deduction_type')
                      ->orWhere('deduction_type', '!=', 'manual');
                })
                ->update(['is_deductible' => 0, 'deduction_type' => 'auto_rep_cash']);
        }

        Log::info("Auditoria finalizada. E>2000: $res1, Comb: $res2, Pers: $res3, REP_Cash: $res4");
    }

    private function getWarningForCfdi($c)
    {
        $metodo = $c->metodo_pago ?? 'PUE';
        $forma = $c->forma_pago ?? '01';
        $total = (float)($c->total ?? 0);
        $concepto = strtoupper($c->concepto ?? '');

        $isFuel = (str_contains($concepto, 'GASOLINA') || 
                   str_contains($concepto, 'COMBUSTIBLE') || 
                   str_contains($concepto, 'DIESEL') || 
                   str_contains($concepto, 'MAGNA') || 
                   str_contains($concepto, 'PREMIUM'));
        
        $uso = strtoupper($c->uso_cfdi ?? '');

        if ($forma === '01' && $isFuel) {
            return "Combustible en efectivo";
        }

        if ($metodo === 'PUE' && $forma === '01' && $total > 2000) {
            return "Efectivo > $2,000";
        }

        if (str_starts_with($uso, 'D')) {
            return "Deduccion Personal";
        }

        return null;
    }

    private function getReasonFriendly($type)
    {
        if (!$type) return null;
        $map = [
            'auto_cash_gt_2000' => 'Gasto en efectivo > $2,000',
            'auto_fuel_cash' => 'Combustible pago en efectivo',
            'auto_personal_deduction' => 'Deducción Personal',
            'manual' => 'Criterio manual del usuario'
        ];
        return $map[$type] ?? $type;
    }
}
