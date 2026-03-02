<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
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

            // Define the rules for "Deductible" in SQL
            $rulesSql = "
                (is_deductible = 1 OR is_deductible IS NULL)
                AND NOT (forma_pago = '01' AND total > 2000)
                AND NOT (forma_pago = '01' AND (concepto LIKE '%GASOLINA%' OR concepto LIKE '%COMBUSTIBLE%' OR concepto LIKE '%DIESEL%' OR concepto LIKE '%MAGNA%' OR concepto LIKE '%PREMIUM%'))
                AND NOT (uso_cfdi LIKE 'D%')
                AND NOT (uso_cfdi IN ('S01', 'P01'))
            ";

            $getInvoicesSum = function ($direction, $metodo, $onlyDeductible = true) use ($rfc, $startDate, $endDate, $tcSql, $rulesSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $query = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', $metodo)
                    ->where('es_cancelado', false)
                    ->whereBetween('fecha_fiscal', [$startDate, $endDate]);
                
                if ($direction === 'egresos') {
                    if ($onlyDeductible) {
                        $query->whereRaw($rulesSql);
                    } else {
                        $query->whereRaw("NOT ($rulesSql)");
                    }
                }

                return $query->select(
                        DB::raw("SUM((subtotal - COALESCE(descuento, 0)) * $tcSql) as subtotal"),
                        DB::raw("SUM(iva * $tcSql) as iva"),
                        DB::raw("SUM(retenciones * $tcSql) as retenciones"),
                        DB::raw("SUM(total * $tcSql) as total")
                    )->first();
            };

            $getRepSum = function($direction, $onlyDeductible = true) use ($rfc, $startDate, $endDate, $rulesSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $tcPago = "COALESCE(NULLIF(cfdi_payments.tipo_cambio_pago, 0), 1)";

                $query = DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $field, $rfc)
                    ->where('reps.es_cancelado', false)
                    ->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate]);

                if ($direction === 'egresos') {
                    $ppdRulesSql = str_replace(['is_deductible', 'forma_pago', 'total', 'uso_cfdi', 'concepto'], 
                                               ['ppds.is_deductible', 'ppds.forma_pago', 'ppds.total', 'ppds.uso_cfdi', 'ppds.concepto'], 
                                               $rulesSql);
                    if ($onlyDeductible) {
                        $query->whereRaw($ppdRulesSql);
                    } else {
                        $query->whereRaw("NOT ($ppdRulesSql)");
                    }
                }

                return $query->select(
                        DB::raw("SUM(cfdi_payments.monto_pagado * ((ppds.subtotal - COALESCE(ppds.descuento, 0)) / NULLIF(ppds.total, 0)) * $tcPago) as subtotal"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.iva / NULLIF(ppds.total, 0)) * $tcPago) as iva"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * (ppds.retenciones / NULLIF(ppds.total, 0)) * $tcPago) as retenciones"),
                        DB::raw("SUM(cfdi_payments.monto_pagado * $tcPago) as total")
                    )->first();
            };

            $getPendSum = function($direction, $onlyDeductible = true) use ($rfc, $startDate, $endDate, $rulesSql) {
                $field = ($direction === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
                $query = DB::table('cfdis')
                    ->where($field, $rfc)
                    ->where('tipo', 'I')
                    ->where('metodo_pago', 'PPD')
                    ->where('es_cancelado', false)
                    ->whereBetween('fecha_fiscal', [$startDate, $endDate]);

                if ($direction === 'egresos') {
                    if ($onlyDeductible) {
                        $query->whereRaw($rulesSql);
                    } else {
                        $query->whereRaw("NOT ($rulesSql)");
                    }
                }

                $invoices = $query->get();

                $res = ['subtotal' => 0, 'iva' => 0, 'retenciones' => 0, 'total' => 0];
                foreach ($invoices as $c) {
                    $moneda = strtoupper($c->moneda ?? 'MXN');
                    $tc = ($moneda === 'MXN') ? 1.0 : (float)($c->tipo_cambio ?? 1.0);
                    if ($tc <= 0) $tc = 1.0;

                    $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                    $balance = max(0, (float)$c->total - (float)$pagado);
                    if ($balance < 0.05) continue;
                    $ratio = $c->total > 0 ? ($balance / (float)$c->total) : 0;
                    
                    $res['subtotal'] += ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $ratio * $tc;
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

            $totalEfectivoIng = (float)($ingPue->total ?? 0) + (float)($ingRep->total ?? 0);
            $totalEfectivoEgr = (float)($egrPue->total ?? 0) + (float)($egrRep->total ?? 0);

            $formatRow = function($pue, $ppd, $rep, $pend, $field) {
                $vP = isset($pue->$field) ? (float)$pue->$field : 0; 
                $vD = isset($ppd->$field) ? (float)$ppd->$field : 0;
                $vR = isset($rep->$field) ? (float)$rep->$field : 0;
                $vN = isset($pend[$field]) ? (float)$pend[$field] : 0;
                return ['pue' => $vP, 'ppd' => $vD, 'rep' => $vR, 'suma_devengado' => $vP + $vD, 'suma_efectivo' => $vP + $vR, 'pendiente' => $vN];
            };

            $alertas = $this->calculateAlerts($rfc, $startDate, $endDate);

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
            return response()->json(['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()], 200);
        }
    }

    private function calculateAlerts($rfc, $startDate, $endDate)
    {
        $alerts = [];
        $business = DB::table('businesses')->where('rfc', $rfc)->first();
        
        // 1. Regime Alert
        if ($business && $business->regimen_fiscal === '626') {
            if ($business->tipo_persona === 'F') {
                $alerts[] = [
                    'type' => 'warning',
                    'title' => 'Régimen RESICO P. Física',
                    'message' => 'El ISR se determina sobre ingresos brutos cobrados. Las deducciones mostradas son solo para efectos de IVA y no restarán base para el cálculo de ISR mensual.'
                ];
            }
        }

        // 2. Cash Limit Alert (> 2000)
        $cashOverLimit = DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->where('metodo_pago', 'PUE')
            ->where('forma_pago', '01') 
            ->where('total', '>', 2000)
            ->where('es_cancelado', false)
            ->whereBetween('fecha_fiscal', [$startDate, $endDate])
            ->count();

        if ($cashOverLimit > 0) {
            $alerts[] = [
                'type' => 'danger',
                'title' => 'Deducciones en Efectivo > $2,000',
                'message' => "Se detectaron $cashOverLimit facturas PUE pagadas en efectivo con importe mayor a $2,000. Estas no cumplen con los requisitos de forma para ser deducibles."
            ];
        }

        // 3. Fuel Alert (Always non-deductible if Cash)
        $fuelCash = DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->where('forma_pago', '01')
            ->where('es_cancelado', false)
            ->whereBetween('fecha_fiscal', [$startDate, $endDate])
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

        // 4. Restaurants Alert
        $restaurants = DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->where('es_cancelado', false)
            ->whereBetween('fecha_fiscal', [$startDate, $endDate])
            ->where('concepto', 'like', '%RESTAURANTE%')
            ->count();

        if ($restaurants > 0) {
            $alerts[] = [
                'type' => 'info',
                'title' => 'Consumo en Restaurantes',
                'message' => "Se detectaron $restaurants consumos en establecimientos de comida. Recuerda que solo el 8.5% del consumo es deducible (salvo que sea un viático por viaje de trabajo)."
            ];
        }

        // 5. General Non-Deductible Stats
        $ndCount = DB::table('cfdis')
            ->where('rfc_receptor', $rfc)
            ->where('is_deductible', false)
            ->where('es_cancelado', false)
            ->whereBetween('fecha_fiscal', [$startDate, $endDate])
            ->count();
        
        if ($ndCount > 0) {
             $alerts[] = [
                'type' => 'info',
                'title' => 'Gastos No Deducibles',
                'message' => "Hay $ndCount facturas marcadas como no deducibles en este periodo."
            ];
        }

        return $alerts;
    }

    private function evaluateInvoiceWarnings($c)
    {
        $evaluation = [
            'is_deductible' => true,
            'reason' => null,
            'warning' => null
        ];

        $uso = $c->uso_cfdi ?? '';
        $forma = $c->forma_pago ?? '';
        $total = (float)($c->total ?? 0);
        $concepto = strtoupper($c->concepto ?? '');

        $isFuel = (str_contains($concepto, 'GASOLINA') || str_contains($concepto, 'COMBUSTIBLE') || str_contains($concepto, 'DIESEL') || str_contains($concepto, 'MAGNA') || str_contains($concepto, 'PREMIUM'));

        // Rule Application
        if ($forma === '01') { // Efectivo
            if ($total > 2000) {
                $evaluation['is_deductible'] = false;
                $evaluation['reason'] = 'Pago en efectivo > $2,000';
                $evaluation['warning'] = 'No deducible por monto en efectivo';
            }
            if ($isFuel) {
                $evaluation['is_deductible'] = false;
                $evaluation['reason'] = 'Combustible en efectivo';
                $evaluation['warning'] = 'Gasolina en efectivo (No deducible)';
            }
        }

        if (str_starts_with($uso, 'D')) {
             $evaluation['is_deductible'] = false;
             $evaluation['reason'] = 'Deducción Personal';
             $evaluation['warning'] = 'No aplica para provisional mensual';
        }

        if ($uso === 'S01' || $uso === 'P01') {
             $evaluation['is_deductible'] = false;
             $evaluation['reason'] = 'Sin efectos fiscales';
             $evaluation['warning'] = 'Uso de CFDI sin efectos';
        }

        // Manual Override Check: If DB already has a value, we respect it if it marks as non-deductible
        if (isset($c->is_deductible)) {
            if (!(bool)$c->is_deductible) {
                $evaluation['is_deductible'] = false;
                $evaluation['reason'] = $c->deduction_type ?? $evaluation['reason'];
            }
        }

        return $evaluation;
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
            
            $rulesSql = "
                (is_deductible = 1 OR is_deductible IS NULL)
                AND NOT (forma_pago = '01' AND total > 2000)
                AND NOT (forma_pago = '01' AND (concepto LIKE '%GASOLINA%' OR concepto LIKE '%COMBUSTIBLE%' OR concepto LIKE '%DIESEL%' OR concepto LIKE '%MAGNA%' OR concepto LIKE '%PREMIUM%'))
                AND NOT (uso_cfdi LIKE 'D%')
                AND NOT (uso_cfdi IN ('S01', 'P01'))
            ";
            
            $fieldRfc = ($dir === 'ingresos') ? 'rfc_emisor' : 'rfc_receptor';
            $onlyDeductible = ($dir === 'egresos' && $cat !== 'nodeducibles');
            $onlyNonDeductible = ($dir === 'egresos' && $cat === 'nodeducibles');

            $results = collect();

            if (!$metodo || $metodo === 'PUE' || $metodo === 'PPD') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('es_cancelado', false)->whereBetween('fecha_fiscal', [$startDate, $endDate]);
                if ($metodo) $query->where('metodo_pago', $metodo);
                else $query->whereIn('metodo_pago', ['PUE', 'PPD']);

                if ($onlyDeductible) $query->whereRaw($rulesSql);
                if ($onlyNonDeductible) $query->whereRaw("NOT ($rulesSql)");

                $resInvoices = $query->get()->map(function($c) use ($dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    
                    $evaluation = $this->evaluateInvoiceWarnings($c);
                    
                    return [
                        'uuid' => $c->uuid, 
                        'fecha' => substr($c->fecha_fiscal, 0, 10), 
                        'nombre' => $nombre,
                        'subtotal' => ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $tc, 
                        'iva' => (float)($c->iva ?? 0) * $tc,
                        'total' => (float)$c->total * $tc, 
                        'metodo_pago' => $c->metodo_pago,
                        'forma_pago' => $c->forma_pago, 
                        'is_deductible' => $evaluation['is_deductible'],
                        'uso_cfdi' => $c->uso_cfdi ?? 'G03', 
                        'reason' => $evaluation['reason'],
                        'warning' => $evaluation['warning'],
                        'conceptos' => $c->concepto // El campo concepto suele guardar la descripción
                    ];
                });
                $results = $results->concat($resInvoices);
            }

            if (!$metodo || $metodo === 'REP') {
                $query = DB::table('cfdi_payments')
                    ->join('cfdis as reps', 'cfdi_payments.uuid_pago', '=', 'reps.uuid')
                    ->join('cfdis as ppds', 'cfdi_payments.uuid_relacionado', '=', 'ppds.uuid')
                    ->where('reps.' . $fieldRfc, $rfc)->where('reps.es_cancelado', false)->whereBetween('cfdi_payments.fecha_pago', [$startDate, $endDate]);

                if ($onlyDeductible) {
                    $ppdRulesSql = str_replace(['is_deductible', 'forma_pago', 'total', 'uso_cfdi', 'concepto'], 
                                               ['ppds.is_deductible', 'ppds.forma_pago', 'ppds.total', 'ppds.uso_cfdi', 'ppds.concepto'], 
                                               $rulesSql);
                    $query->whereRaw($ppdRulesSql);
                }
                if ($onlyNonDeductible) {
                    $ppdRulesSql = str_replace(['is_deductible', 'forma_pago', 'total', 'uso_cfdi', 'concepto'], 
                                               ['ppds.is_deductible', 'ppds.forma_pago', 'ppds.total', 'ppds.uso_cfdi', 'ppds.concepto'], 
                                               $rulesSql);
                    $query->whereRaw("NOT ($ppdRulesSql)");
                }

                $resReps = $query->select('cfdi_payments.*', 'ppds.name_receptor', 'ppds.name_emisor', 'ppds.subtotal as ppd_sub', 'ppds.iva as ppd_iva', 'ppds.total as ppd_tot', 'ppds.moneda as ppd_mon', 'ppds.tipo_cambio as ppd_tc', 'ppds.forma_pago', 'ppds.is_deductible', 'ppds.uso_cfdi', 'ppds.descuento as ppd_desc', 'ppds.concepto as ppd_concept', 'ppds.uuid as ppd_uuid')
                    ->get()->map(function($p) use ($dir) {
                        $ratio = $p->ppd_tot > 0 ? ($p->monto_pagado / $p->ppd_tot) : 0;
                        $tc = (strtoupper($p->ppd_mon ?? 'MXN') === 'MXN') ? 1 : ($p->ppd_tc ?: 1);
                        $nombre = ($dir === 'ingresos') ? $p->name_receptor : $p->name_emisor;
                        
                        // Note: For REPs, the PPD's data determines deductibility rules
                        $evalData = (object)[
                            'uuid' => $p->ppd_uuid,
                            'total' => $p->ppd_tot,
                            'forma_pago' => $p->forma_pago,
                            'uso_cfdi' => $p->uso_cfdi,
                            'concepto' => $p->ppd_concept,
                            'is_deductible' => $p->is_deductible,
                            'deduction_type' => null
                        ];
                        $evaluation = $this->evaluateInvoiceWarnings($evalData);

                        return [
                            'uuid' => $p->uuid_pago, 
                            'fecha' => substr($p->fecha_pago, 0, 10), 
                            'nombre' => $nombre,
                            'subtotal' => ((float)($p->ppd_sub ?? 0) - (float)($p->ppd_desc ?? 0)) * $ratio * $tc, 
                            'iva' => (float)($p->ppd_iva ?? 0) * $ratio * $tc,
                            'total' => (float)$p->monto_pagado, 
                            'metodo_pago' => 'REP', 
                            'forma_pago' => $p->forma_pago ?? '99', 
                            'is_deductible' => $evaluation['is_deductible'], 
                            'uso_cfdi' => $p->uso_cfdi ?? 'G03', 
                            'reason' => $evaluation['reason'],
                            'warning' => $evaluation['warning'],
                            'ppd_uuid' => $p->ppd_uuid
                        ];
                    });
                $results = $results->concat($resReps);
            }

            if (!$metodo || $metodo === 'PENDIENTE') {
                $query = DB::table('cfdis')->where($fieldRfc, $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')->where('es_cancelado', false)->whereBetween('fecha_fiscal', [$startDate, $endDate]);
                if ($onlyDeductible) $query->whereRaw($rulesSql);
                if ($onlyNonDeductible) $query->whereRaw("NOT ($rulesSql)");

                $resPend = $query->get()->map(function($c) use ($endDate, $dir) {
                    $tc = (strtoupper($c->moneda ?? 'MXN') === 'MXN') ? 1 : ($c->tipo_cambio ?: 1);
                    $pagado = DB::table('cfdi_payments')->where('uuid_relacionado', $c->uuid)->where('fecha_pago', '<=', $endDate)->sum('monto_pagado');
                    $bal = max(0, (float)$c->total - (float)$pagado);
                    if ($bal < 0.05) return null;
                    $ratio = $c->total > 0 ? ($bal / (float)$c->total) : 0;
                    $nombre = ($dir === 'ingresos') ? $c->name_receptor : $c->name_emisor;
                    
                    $evaluation = $this->evaluateInvoiceWarnings($c);
                    
                    return [
                        'uuid' => $c->uuid, 
                        'fecha' => substr($c->fecha_fiscal, 0, 10), 
                        'nombre' => $nombre,
                        'subtotal' => ((float)$c->subtotal - (float)($c->descuento ?? 0)) * $ratio * $tc, 
                        'iva' => (float)($c->iva ?? 0) * $ratio * $tc,
                        'total' => $bal * $tc, 
                        'metodo_pago' => $c->metodo_pago, 
                        'is_deductible' => $evaluation['is_deductible'], 
                        'uso_cfdi' => $c->uso_cfdi ?? 'G03', 
                        'forma_pago' => $c->forma_pago, 
                        'reason' => $evaluation['reason'],
                        'warning' => $evaluation['warning']
                    ];
                })->filter()->values();
                $results = $results->concat($resPend);
            }

            return response()->json($results->values());
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function toggleDeductibility(Request $request)
    {
        try {
            $uuid = $request->input('uuid');
            $isDeductible = (bool)$request->input('is_deductible');
            
            DB::table('cfdis')->where('uuid', $uuid)->update([
                'is_deductible' => $isDeductible,
                'deduction_type' => $isDeductible ? null : 'Manual Non-Deductible'
            ]);
            
            return response()->json(['success' => true]);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function exportDetailedBucketPdf(Request $request) { /* Placeholder */ }
    public function exportCfdiPdf($uuid) { /* Placeholder */ }
    public function exportProvisionalExcel(Request $request) { /* Placeholder */ }
    public function exportProvisionalPdfSummary(Request $request) { /* Placeholder */ }
}