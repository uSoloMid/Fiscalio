<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BankStatement;
use App\Models\BankMovement;
use App\Models\Cfdi;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ReconciliationController extends Controller
{
    public function suggest(Request $request, $statementId)
    {
        $statement = BankStatement::with(['movements.cfdi', 'business'])->findOrFail($statementId);
        $business = $statement->business;
        $businessRfc = $business->rfc;

        // Load all valid CFDIs for this business (emitted or received)
        $cfdis = Cfdi::where(function ($q) use ($businessRfc) {
                $q->where('rfc_emisor', $businessRfc)
                  ->orWhere('rfc_receptor', $businessRfc);
            })
            ->where('es_cancelado', 0)
            ->whereIn('tipo', ['I', 'E', 'P'])
            ->with('pagosRelacionados')
            ->get();

        $movements = $statement->movements;
        $stats = ['total' => count($movements), 'green' => 0, 'yellow' => 0, 'red' => 0, 'unmatched' => 0];

        $result = $movements->map(function ($movement) use ($cfdis, $businessRfc, &$stats) {
            $data = $movement->toArray();

            // Already reconciled — return as-is with linked CFDI
            if ($movement->cfdi_id) {
                $conf = $movement->confidence ?? 'green';
                $stats[$conf] = ($stats[$conf] ?? 0) + 1;
                $data['suggestions'] = [];
                return $data;
            }

            $suggestions = $this->findMatches($movement, $cfdis, $businessRfc);

            if (empty($suggestions)) {
                $stats['unmatched']++;
                $data['_confidence_preview'] = 'black';
            } else {
                $top = $suggestions[0]['confidence'];
                $stats[$top] = ($stats[$top] ?? 0) + 1;
                $data['_confidence_preview'] = $top;
            }

            $data['suggestions'] = $suggestions;
            return $data;
        });

        return response()->json([
            'statement' => $statement->only(['id', 'bank_name', 'account_number', 'period', 'total_cargos', 'total_abonos', 'initial_balance', 'final_balance']),
            'movements' => $result,
            'stats'     => $stats,
        ]);
    }

    public function reconcile(Request $request, $id)
    {
        $request->validate([
            'cfdi_id'    => 'required|integer|exists:cfdis,id',
            'confidence' => 'nullable|string|in:green,yellow,red,black',
        ]);

        $movement = BankMovement::findOrFail($id);
        $movement->update([
            'cfdi_id'       => $request->cfdi_id,
            'confidence'    => $request->confidence ?? 'green',
            'is_reviewed'   => true,
            'reconciled_at' => now(),
        ]);

        return response()->json([
            'success'  => true,
            'movement' => $movement->fresh()->load('cfdi'),
        ]);
    }

    public function unreconcile($id)
    {
        $movement = BankMovement::findOrFail($id);
        $movement->update([
            'cfdi_id'       => null,
            'confidence'    => null,
            'is_reviewed'   => false,
            'reconciled_at' => null,
        ]);

        return response()->json(['success' => true]);
    }

    // -------------------------------------------------------------------------

    private function findMatches(BankMovement $movement, Collection $cfdis, string $businessRfc): array
    {
        $isEgreso = $movement->cargo > 0;
        $amount   = $isEgreso ? $movement->cargo : $movement->abono;
        $movDate  = Carbon::parse($movement->date);

        $candidates = [];

        foreach ($cfdis as $cfdi) {
            // Direction filter
            if ($isEgreso && !in_array($cfdi->tipo, ['E', 'P'])) continue;
            if (!$isEgreso && $cfdi->tipo !== 'I') continue;

            // Skip foreign currency — too risky without exact exchange rate
            if ($cfdi->moneda !== 'MXN' && $cfdi->tipo_cambio != 1) continue;

            // Payment CFDI: match against cfdi_payments.monto_pagado
            if ($cfdi->tipo === 'P') {
                foreach ($cfdi->pagosRelacionados as $payment) {
                    if (abs($payment->monto_pagado - $amount) > 0.01) continue;

                    $payDate   = Carbon::parse($payment->fecha_pago);
                    $daysDiff  = (int) abs($movDate->diffInDays($payDate));
                    $confidence = $this->computeConfidence(true, $daysDiff, $cfdi, $businessRfc);

                    $candidates[] = [
                        'cfdi_id'      => $cfdi->id,
                        'uuid'         => $cfdi->uuid,
                        'rfc_emisor'   => $cfdi->rfc_emisor,
                        'rfc_receptor' => $cfdi->rfc_receptor,
                        'name_emisor'  => $cfdi->name_emisor,
                        'name_receptor'=> $cfdi->name_receptor,
                        'fecha'        => $cfdi->fecha,
                        'total'        => (float) $cfdi->total,
                        'tipo'         => $cfdi->tipo,
                        'confidence'   => $confidence,
                        'days_diff'    => $daysDiff,
                        'match_via'    => 'payment',
                        'payment_uuid' => $payment->uuid_pago,
                        'monto_pagado' => (float) $payment->monto_pagado,
                    ];
                }
                continue;
            }

            // Ingreso / Egreso: match against cfdi->total
            if (abs($cfdi->total - $amount) > 0.01) continue;

            $cfdiDate   = Carbon::parse($cfdi->fecha);
            $daysDiff   = (int) abs($movDate->diffInDays($cfdiDate));
            $confidence = $this->computeConfidence(true, $daysDiff, $cfdi, $businessRfc);

            $candidates[] = [
                'cfdi_id'      => $cfdi->id,
                'uuid'         => $cfdi->uuid,
                'rfc_emisor'   => $cfdi->rfc_emisor,
                'rfc_receptor' => $cfdi->rfc_receptor,
                'name_emisor'  => $cfdi->name_emisor,
                'name_receptor'=> $cfdi->name_receptor,
                'fecha'        => $cfdi->fecha,
                'total'        => (float) $cfdi->total,
                'tipo'         => $cfdi->tipo,
                'confidence'   => $confidence,
                'days_diff'    => $daysDiff,
                'match_via'    => 'total',
            ];
        }

        // Sort: green > yellow > red
        usort($candidates, fn($a, $b) =>
            $this->confidenceRank($b['confidence']) <=> $this->confidenceRank($a['confidence'])
        );

        return $candidates;
    }

    private function computeConfidence(bool $exactAmount, int $daysDiff, Cfdi $cfdi, string $businessRfc): string
    {
        $rfcMatch = ($cfdi->rfc_emisor === $businessRfc || $cfdi->rfc_receptor === $businessRfc);

        if ($exactAmount && $rfcMatch && $daysDiff <= 5) return 'green';
        if ($exactAmount && $daysDiff <= 5)              return 'yellow';
        if ($exactAmount)                                return 'yellow';
        return 'red';
    }

    private function confidenceRank(string $confidence): int
    {
        return match($confidence) {
            'green'  => 3,
            'yellow' => 2,
            'red'    => 1,
            default  => 0,
        };
    }
}
