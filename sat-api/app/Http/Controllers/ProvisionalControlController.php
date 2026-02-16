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
            $rfc = (string)$request->query('rfc');
            $year = (int)$request->query('year');
            $month = (int)$request->query('month');

            if (!$rfc || !$year || !$month) {
                return response()->json(['error' => 'Missing parameters'], 400);
            }

            $strMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
            $startDate = "{$year}-{$strMonth}-01 00:00:00";
            $carbonEnd = Carbon::createFromDate($year, $month, 1)->endOfMonth();
            $endDate = $carbonEnd->format('Y-m-d 23:59:59');

            $tcSql = "CASE WHEN moneda = 'MXN' OR moneda IS NULL THEN 1 ELSE COALESCE(NULLIF(tipo_cambio, 0), 1) END";

            $getInvoicesSum = function ($direction, $metodo, $onlyDeductible = true) use ($rfc, $startDate, $endDate, $tcSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $query = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', $metodo)
                    ->where('es_cancelado', false)
                    ->whereBetween('fecha', [$startDate, $endDate]);
                
                if ($direction === 'egresos') {
                    $query->where('is_deductible', $onlyDeductible);
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
                    $query->where('ppds.is_deductible', $onlyDeductible);
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
                    ->whereBetween('fecha', [$startDate, $endDate]);

                if ($direction === 'egresos') {
                    $query->where('is_deductible', $onlyDeductible);
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
                'alertas' => []
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getBucketDetails(Request $request)
    {
        try {
            $rfc = (string)$request->query('rfc');
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
            $onlyDeductible = ($dir === 'egresos' && $cat !== 'nodeducibles');
            $onlyNonDeductible = ($dir === 'egresos' && $cat === 'nodeducibles');

            $results = collect();

            if (!$metodo || $metodo === 'PUE' || $metodo === 'PPD') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('es_cancelado', false)->whereBetween('fecha', [$startDate, $endDate]);
                if ($metodo) $query->where('metodo_pago', $metodo);
                else $query->whereIn('metodo_pago', ['PUE', 'PPD']);

                if ($onlyDeductible) $query->where('is_deductible', true);
                if ($onlyNonDeductible) $query->where('is_deductible', false);

                $resInvoices = $query->get()->map(function($c) use ($dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    return [
                        'uuid' => $c->uuid, 'fecha' => substr($c->fecha, 0, 10), 'nombre' => $nombre,
                        'subtotal' => (float)$c->subtotal * $tc, 'iva' => (float)($c->iva ?? 0) * $tc,
                        'total' => (float)$c->total * $tc, 'metodo_pago' => $c->metodo_pago,
                        'forma_pago' => $c->forma_pago, 'is_deductible' => (bool)($c->is_deductible ?? true), 'uso_cfdi' => $c->uso_cfdi ?? 'G03'
                    ];
                });
                $results = $results->concat($resInvoices);
            }

            if (!$metodo || $metodo === 'REP') {
                $query = DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $fieldRfc, $rfc)->where('reps.es_cancelado', false)->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate]);

                if ($onlyDeductible) $query->where('ppds.is_deductible', true);
                if ($onlyNonDeductible) $query->where('ppds.is_deductible', false);

                $resReps = $query->select('cfdi_payments.*', 'ppds.name_receptor', 'ppds.name_emisor', 'ppds.subtotal as ppd_sub', 'ppds.iva as ppd_iva', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc', 'ppds.forma_pago', 'ppds.is_deductible', 'ppds.uso_cfdi')
                    ->get()->map(function($p) use ($dir) {
                        $ratio = $p->ppd_tot > 0 ? ($p->monto_pagado / $p->ppd_tot) : 0;
                        $tc = (strtoupper($p->ppd_mon ?? 'MXN') === 'MXN') ? 1 : ($p->ppd_tc ?: 1);
                        $nombre = ($dir === 'ingresos') ? $p->name_receptor : $p->name_emisor;
                        return [
                            'uuid' => $p->uuid_pago, 'fecha' => substr($p->fecha_pago, 0, 10), 'nombre' => $nombre,
                            'subtotal' => (float)($p->ppd_sub ?? 0) * $ratio * $tc, 'iva' => (float)($p->ppd_iva ?? 0) * $ratio * $tc,
                            'total' => (float)$p->monto_pagado, 'metodo_pago' => 'REP', 'forma_pago' => $p->forma_pago ?? '99', 'is_deductible' => (bool)($p->is_deductible ?? true), 'uso_cfdi' => $p->uso_cfdi ?? 'G03'
                        ];
                    });
                $results = $results->concat($resReps);
            }

            if (!$metodo || $metodo === 'PENDIENTE') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')->where('es_cancelado', false)->whereBetween('fecha', [$startDate, $endDate]);
                if ($onlyDeductible) $query->where('is_deductible', true);
                if ($onlyNonDeductible) $query->where('is_deductible', false);

                $resPend = $query->get()->map(function($c) use ($endDate, $dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                    $bal = max(0, (float)$c->total - (float)$pagado);
                    if ($bal < 0.05) return null;
                    $ratio = $c->total > 0 ? ($bal / (float)$c->total) : 0;
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    return [
                        'uuid' => $c->uuid, 'fecha' => substr($c->fecha, 0, 10), 'nombre' => $nombre,
                        'subtotal' => (float)$c->subtotal * $ratio * $tc, 'iva' => (float)($c->iva ?? 0) * $ratio * $tc,
                        'total' => $bal * $tc, 'metodo_pago' => $c->metodo_pago, 'is_deductible' => (bool)($c->is_deductible ?? true), 'uso_cfdi' => $c->uso_cfdi ?? 'G03', 'forma_pago' => $c->forma_pago
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
            $cfdi = \App\Models\Cfdi::where('uuid', $uuid)->firstOrFail();
            $cfdi->update(['is_deductible' => $request->input('is_deductible'), 'deduction_type' => $request->input('deduction_type', $cfdi->deduction_type)]);
            return response()->json(['ok' => true]);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportDetailedBucketPdf(Request $request)
    {
        return response()->json(['error' => 'Not implemented yet'], 501);
    }
}
