<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

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

            $getInvoicesSum = function ($direction, $metodo) use ($rfc, $startDate, $endDate, $tcSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                return DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', $metodo)
                    ->where('es_cancelado', false)
                    ->whereBetween('fecha', [$startDate, $endDate])
                    ->select(
                        DB::raw("SUM(subtotal * $tcSql) as subtotal"),
                        DB::raw("SUM(iva * $tcSql) as iva"),
                        DB::raw("SUM(retenciones * $tcSql) as retenciones"),
                        DB::raw("SUM(total * $tcSql) as total")
                    )->first();
            };

            $getRepSum = function($direction) use ($rfc, $startDate, $endDate) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $tcPago = "COALESCE(NULLIF(cfdi_payments.tipo_cambio_pago, 0), 1)";

                return DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $field, $rfc)
                    ->where('reps.es_cancelado', false)
                    ->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate])
                    ->select(
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.subtotal / NULLIF(ppds.total, 0)) * $tcPago) as subtotal"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.iva / NULLIF(ppds.total, 0)) * $tcPago) as iva"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.retenciones / NULLIF(ppds.total, 0)) * $tcPago) as retenciones"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * $tcPago) as total")
                    )->first();
            };

            $getPendSum = function($direction) use ($rfc, $startDate, $endDate) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $invoices = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', 'PPD')
                    ->where('es_cancelado', false)
                    ->whereBetween('fecha', [$startDate, $endDate])
                    ->get();

                $res = ['subtotal' => 0, 'iva' => 0, 'retenciones' => 0, 'total' => 0];
                $trace = []; 
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
                    $trace[] = ['uuid' => $c->uuid, 'sub' => (float)$c->subtotal * $ratio * $tc];
                }
                $res['_trace'] = $trace;
                return $res;
            };

            $ingPue = $getInvoicesSum('ingresos', 'PUE');
            $ingPpd = $getInvoicesSum('ingresos', 'PPD');
            $ingRep = $getRepSum('ingresos');
            $ingPend = $getPendSum('ingresos');

            $egrPue = $getInvoicesSum('egresos', 'PUE');
            $egrPpd = $getInvoicesSum('egresos', 'PPD');
            $egrRep = $getRepSum('egresos');
            $egrPend = $getPendSum('egresos');

            $buildBreakdown = function($pue, $ppd, $rep, $pend) {
                $f = function($vP, $vD, $vR, $vN) {
                    $p = (float)($vP ?? 0); $d = (float)($vD ?? 0); $r = (float)($vR ?? 0); $n = (float)($vN ?? 0);
                    return ['pue' => $p, 'ppd' => $d, 'rep' => $r, 'suma_devengado' => $p + $d, 'suma_efectivo' => $p + $r, 'pendiente' => $n];
                };
                return [
                    'subtotal' => $f($pue->subtotal, $ppd->subtotal, $rep->subtotal, $pend['subtotal']),
                    'iva' => $f($pue->iva, $ppd->iva, $rep->iva, $pend['iva']),
                    'retenciones' => $f($pue->retenciones, $ppd->retenciones, $rep->retenciones, $pend['retenciones']),
                    'total' => $f($pue->total, $ppd->total, $rep->total, $pend['total']),
                ];
            };

            return response()->json([
                '_version' => 'FINAL_CORRECT_v4_POSH',
                'ingresos' => array_merge(['total_efectivo' => (float)($ingPue->total??0) + (float)($ingRep->total??0)], $buildBreakdown($ingPue, $ingPpd, $ingRep, $ingPend)),
                'egresos' => array_merge(['total_efectivo' => (float)($egrPue->total??0) + (float)($egrRep->total??0)], $buildBreakdown($egrPue, $egrPpd, $egrRep, $egrPend)),
                'alertas' => array_merge($ingPend['_trace'], $egrPend['_trace'])
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function getBucketDetails(Request $request)
    {
        $rfc = (string)$request->query('rfc');
        $year = (int)$request->query('year');
        $month = (int)$request->query('month');
        $bucket = (string)$request->query('bucket'); 
        $strMonth = str_pad($month, 2, '0', STR_PAD_LEFT);
        $startDate = "{$year}-{$strMonth}-01 00:00:00";
        $carbonEnd = Carbon::createFromDate($year, $month, 1)->endOfMonth();
        $endDate = $carbonEnd->format('Y-m-d 23:59:59');

        $parts = explode('_', $bucket);
        if (count($parts) < 3) return response()->json([]);
        $dir = $parts[0]; $metodo = strtoupper($parts[2]);
        $fieldRfc = ($dir === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';

        if ($metodo === 'PUE' || $metodo === 'PPD') {
            $results = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('metodo_pago', $metodo)->where('es_cancelado', false)->whereBetween('fecha', [$startDate, $endDate])->get()->map(function($c) {
                $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                return ['uuid' => $c->uuid, 'fecha' => substr($c->fecha, 0, 10), 'name_receptor' => $c->name_receptor, 'subtotal' => (float)$c->subtotal * $tc, 'total' => (float)$c->total * $tc, 'tipo' => $c->tipo];
            });
        } elseif ($metodo === 'REP') {
            $results = DB::table('cfdi_payments')->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')->where('reps.' . $fieldRfc, $rfc)->where('reps.es_cancelado', false)->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate])->select('cfdi_payments.*', 'ppds.name_receptor', 'ppds.subtotal as ppd_sub', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc')->get()->map(function($p) {
                $ratio = $p->ppd_tot > 0 ? ($p->monto_pagado / $p->ppd_tot) : 0;
                $tc = (strtoupper($p->ppd_mon ?? 'MXN') === 'MXN') ? 1 : ($p->ppd_tc ?: 1);
                return ['uuid' => $p->uuid_pago, 'fecha' => substr($p->fecha_pago, 0, 10), 'name_receptor' => $p->name_receptor, 'subtotal' => (float)$p->ppd_sub * $ratio * $tc, 'total' => (float)$p->monto_pagado, 'tipo' => 'P'];
            });
        } elseif ($metodo === 'PENDIENTE') {
            $results = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')->where('es_cancelado', false)->whereBetween('fecha', [$startDate, $endDate])->get()->map(function($c) use ($endDate) {
                $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                $bal = max(0, (float)$c->total - (float)$pagado);
                if ($bal < 0.05) return null;
                $ratio = $c->total > 0 ? ($bal / (float)$c->total) : 0;
                return ['uuid' => $c->uuid, 'fecha' => substr($c->fecha, 0, 10), 'name_receptor' => $c->name_receptor, 'subtotal' => (float)$c->subtotal * $ratio * $tc, 'total' => $bal, 'tipo' => 'I'];
            })->filter()->values();
        } else { return response()->json([]); }
        return response()->json($results);
    }

    public function getPpdExplorer(Request $request) { return response()->json([]); }
    public function getRepExplorer(Request $request) { return response()->json([]); }
}
