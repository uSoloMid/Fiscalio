<?php

namespace App\Http\Controllers;

use App\Models\Cfdi;
use App\Models\CfdiPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProvisionalControlController extends Controller
{
    public function getSummary(Request $request)
    {
        $rfc = $request->query('rfc');
        $year = $request->query('year');
        $month = $request->query('month');

        if (!$rfc || !$year || !$month) {
            return response()->json(['error' => 'Missing parameters'], 400);
        }

        // Helper to sum financial fields
        $getSums = function ($query) {
            return $query->select(
                DB::raw('SUM(subtotal * tipo_cambio) as subtotal'),
                DB::raw('SUM(iva * tipo_cambio) as iva'),
                DB::raw('SUM(total * tipo_cambio) as total')
            )->first();
        };

        // --- INGRESOS ---
        $ingPue = $getSums(Cfdi::where('rfc_emisor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PUE')
            ->whereYear('fecha', $year)->whereMonth('fecha', $month)->where('es_cancelado', false));

        $ingPpd = $getSums(Cfdi::where('rfc_emisor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')
            ->whereYear('fecha', $year)->whereMonth('fecha', $month)->where('es_cancelado', false));

        $ingRep = CfdiPayment::whereHas('pago', function ($q) use ($rfc) {
            $q->where('rfc_emisor', $rfc)->where('es_cancelado', false);
        })
            ->join('cfdis', 'cfdi_payments.uuid_relacionado', '=', 'cfdis.uuid')
            ->whereYear('cfdi_payments.fecha_pago', $year)
            ->whereMonth('cfdi_payments.fecha_pago', $month)
            ->select(
                DB::raw('SUM(monto_pagado * (cfdis.subtotal / NULLIF(cfdis.total, 0)) * tipo_cambio_pago) as subtotal'),
                DB::raw('SUM(monto_pagado * (cfdis.iva / NULLIF(cfdis.total, 0)) * tipo_cambio_pago) as iva'),
                DB::raw('SUM(monto_pagado * tipo_cambio_pago) as total')
            )->first();

        // Pendiente (Total Histórico de PPDs no pagadas)
        $ingPendiente = Cfdi::where('rfc_emisor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')
            ->where('es_cancelado', false)
            ->get()
            ->map(function ($cfdi) {
                $pagado = CfdiPayment::where('uuid_relacionado', $cfdi->uuid)->sum('monto_pagado');
                $ratioSubtotal = $cfdi->total > 0 ? ($cfdi->subtotal / $cfdi->total) : 0;
                $ratioIva = $cfdi->total > 0 ? ($cfdi->iva / $cfdi->total) : 0;
                $saldo = max(0, $cfdi->total - $pagado);
                return [
                    'subtotal' => $saldo * $ratioSubtotal * $cfdi->tipo_cambio,
                    'iva' => $saldo * $ratioIva * $cfdi->tipo_cambio,
                    'total' => $saldo * $cfdi->tipo_cambio
                ];
            });

        $ingPendienteSums = [
            'subtotal' => $ingPendiente->sum('subtotal'),
            'iva' => $ingPendiente->sum('iva'),
            'total' => $ingPendiente->sum('total'),
        ];

        // --- EGRESOS ---
        $egrPue = $getSums(Cfdi::where('rfc_receptor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PUE')
            ->whereYear('fecha', $year)->whereMonth('fecha', $month)->where('es_cancelado', false));

        $egrPpd = $getSums(Cfdi::where('rfc_receptor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')
            ->whereYear('fecha', $year)->whereMonth('fecha', $month)->where('es_cancelado', false));

        $egrRep = CfdiPayment::whereHas('pago', function ($q) use ($rfc) {
            $q->where('rfc_receptor', $rfc)->where('es_cancelado', false);
        })
            ->join('cfdis', 'cfdi_payments.uuid_relacionado', '=', 'cfdis.uuid')
            ->whereYear('cfdi_payments.fecha_pago', $year)
            ->whereMonth('cfdi_payments.fecha_pago', $month)
            ->select(
                DB::raw('SUM(monto_pagado * (cfdis.subtotal / NULLIF(cfdis.total, 0)) * tipo_cambio_pago) as subtotal'),
                DB::raw('SUM(monto_pagado * (cfdis.iva / NULLIF(cfdis.total, 0)) * tipo_cambio_pago) as iva'),
                DB::raw('SUM(monto_pagado * tipo_cambio_pago) as total')
            )->first();

        // Pendiente Egresos
        $egrPendiente = Cfdi::where('rfc_receptor', $rfc)->where('tipo', 'I')->where('metodo_pago', 'PPD')
            ->where('es_cancelado', false)
            ->get()
            ->map(function ($cfdi) {
                $pagado = CfdiPayment::where('uuid_relacionado', $cfdi->uuid)->sum('monto_pagado');
                $ratioSubtotal = $cfdi->total > 0 ? ($cfdi->subtotal / $cfdi->total) : 0;
                $ratioIva = $cfdi->total > 0 ? ($cfdi->iva / $cfdi->total) : 0;
                $saldo = max(0, $cfdi->total - $pagado);
                return [
                    'subtotal' => $saldo * $ratioSubtotal * $cfdi->tipo_cambio,
                    'iva' => $saldo * $ratioIva * $cfdi->tipo_cambio,
                    'total' => $saldo * $cfdi->tipo_cambio
                ];
            });

        $egrPendienteSums = [
            'subtotal' => $egrPendiente->sum('subtotal'),
            'iva' => $egrPendiente->sum('iva'),
            'total' => $egrPendiente->sum('total'),
        ];

        // Format function to ensure NO NaN in frontend
        $fmt = function($pue, $ppd, $rep, $pend) {
            $p = (float)($pue ?: 0);
            $d = (float)($ppd ?: 0);
            $r = (float)($rep ?: 0);
            $n = (float)($pend ?: 0);
            return [
                'pue' => $p,
                'ppd' => $d,
                'rep' => $r,
                'suma_devengado' => $p + $d,
                'suma_efectivo' => $p + $r,
                'pendiente' => $n
            ];
        };

        return response()->json([
            'ingresos' => [
                'total_efectivo' => (float)$ingPue->total + (float)$ingRep->total,
                'subtotal' => $fmt($ingPue->subtotal, $ingPpd->subtotal, $ingRep->subtotal, $ingPendienteSums['subtotal']),
                'iva' => $fmt($ingPue->iva, $ingPpd->iva, $ingRep->iva, $ingPendienteSums['iva']),
                'total' => $fmt($ingPue->total, $ingPpd->total, $ingRep->total, $ingPendienteSums['total']),
            ],
            'egresos' => [
                'total_efectivo' => (float)$egrPue->total + (float)$egrRep->total,
                'subtotal' => $fmt($egrPue->subtotal, $egrPpd->subtotal, $egrRep->subtotal, $egrPendienteSums['subtotal']),
                'iva' => $fmt($egrPue->iva, $egrPpd->iva, $egrRep->iva, $egrPendienteSums['iva']),
                'total' => $fmt($egrPue->total, $egrPpd->total, $egrRep->total, $egrPendienteSums['total']),
            ],
            'alertas' => []
        ]);
    }

    public function getPpdExplorer(Request $request)
    {
        $rfc = $request->query('rfc');
        $year = $request->query('year');
        $month = $request->query('month');
        $tipo = $request->query('tipo', 'issued');

        $query = Cfdi::where('tipo', 'I')->where('metodo_pago', 'PPD')->where('es_cancelado', false);
        if ($tipo === 'issued') $query->where('rfc_emisor', $rfc);
        else $query->where('rfc_receptor', $rfc);

        if ($year) $query->whereYear('fecha', $year);
        if ($month) $query->whereMonth('fecha', $month);

        $results = $query->orderBy('fecha', 'desc')->paginate(50);
        foreach ($results as $cfdi) {
            $pagado = CfdiPayment::where('uuid_relacionado', $cfdi->uuid)->sum('monto_pagado');
            $cfdi->monto_pagado = $pagado;
            $cfdi->saldo_pendiente = max(0, $cfdi->total - $pagado);
            $cfdi->status_pago = $cfdi->saldo_pendiente <= 0.01 ? 'Liquidada' : ($pagado > 0 ? 'Parcial' : 'Pendiente');
        }
        return response()->json($results);
    }

    public function getRepExplorer(Request $request)
    {
        $rfc = $request->query('rfc');
        $year = $request->query('year');
        $month = $request->query('month');
        $tipo = $request->query('tipo', 'issued');

        $query = Cfdi::where('tipo', 'P')->where('es_cancelado', false);
        if ($tipo === 'issued') $query->where('rfc_emisor', $rfc);
        else $query->where('rfc_receptor', $rfc);

        if ($year) $query->whereYear('fecha', $year);
        if ($month) $query->whereMonth('fecha', $month);

        $results = $query->orderBy('fecha', 'desc')->paginate(50);
        foreach ($results as $cfdi) {
            $cfdi->relacionados = CfdiPayment::where('uuid_pago', $cfdi->uuid)->get();
        }
        return response()->json($results);
    }
}
