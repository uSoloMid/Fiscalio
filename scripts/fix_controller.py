import os

content = """<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\BankStatement;
use App\Models\BankMovement;
use App\Models\Cfdi;
use App\Models\ReconciliationPattern;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ReconciliationController extends Controller
{
    public function suggest(Request $request, $statementId)
    {
        ini_set('memory_limit', '512M');
        set_time_limit(120);

        $statement = BankStatement::with(['movements.cfdi', 'business'])->findOrFail($statementId);
        $business   = $statement->business;
        $businessRfc = $business->rfc;
        $businessId  = $business->id;

        // Load all valid CFDIs for this business, optimized memory by selecting only necessary columns
        $query = Cfdi::select([
                'id', 'uuid', 'rfc_emisor', 'rfc_receptor', 'name_emisor', 'name_receptor',
                'fecha', 'total', 'tipo', 'metodo_pago', 'forma_pago', 'moneda', 'tipo_cambio', 'es_cancelado', 'traslados_locales', 'retenciones_locales'
            ])
            ->where(function ($q) use ($businessRfc) {
                $q->where('rfc_emisor', $businessRfc)
                  ->orWhere('rfc_receptor', $businessRfc);
            })
            ->where('es_cancelado', 0)
            ->whereIn('tipo', ['I', 'E', 'P']);

        // Optimization: limit search range near the statement period if available
        if ($statement->period && preg_match('/^([A-Z]{3})-(\d{4})$/', $statement->period, $m)) {
            $monthsMap = ['ENE' => 1, 'FEB' => 2, 'MAR' => 3, 'ABR' => 4, 'MAY' => 5, 'JUN' => 6, 'JUL' => 7, 'AGO' => 8, 'SEP' => 9, 'OCT' => 10, 'NOV' => 11, 'DIC' => 12];
            $month = $monthsMap[$m[1]] ?? 0;
            $year = (int)$m[2];
            if ($month > 0) {
                $startDate = Carbon::create($year, $month, 1)->subMonth()->startOfMonth();
                $endDate = Carbon::create($year, $month, 1)->endOfMonth()->addDays(15); 
                $query->whereBetween('fecha', [$startDate, $endDate]);
            }
        }

        $cfdis = $query->with([
                'pagosRelacionados:id,uuid_pago,uuid_relacionado,monto_pagado,fecha_pago',
                'pagosPropios:id,uuid_pago,uuid_relacionado,monto_pagado,fecha_pago'
            ])
            ->get();

        // Load learned patterns for this business
        $learnedPatterns = ReconciliationPattern::where('business_id', $businessId)
            ->orderByDesc('confirmed_count')
            ->get()
            ->groupBy('description_keyword')
            ->map(fn($group) => $group->pluck('counterpart_rfc')->all())
            ->all();

        $movements = $statement->movements;
        $stats = ['total' => count($movements), 'green' => 0, 'yellow' => 0, 'red' => 0, 'unmatched' => 0];

        $result = $movements->map(function ($movement) use ($cfdis, $businessRfc, $businessId, $learnedPatterns, &$stats) {
            $data = $movement->toArray();

            if ($movement->cfdi_id) {
                $conf = $movement->confidence ?? 'green';
                $stats[$conf] = ($stats[$conf] ?? 0) + 1;
                $data['suggestions'] = [];
                return $data;
            }

            $suggestions = $this->findMatches($movement, $cfdis, $businessRfc, $learnedPatterns);

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

        $movement = BankMovement::with('statement.business')->findOrFail($id);
        $cfdi     = Cfdi::findOrFail($request->cfdi_id);

        $movement->update([
            'cfdi_id'       => $request->cfdi_id,
            'confidence'    => $request->confidence ?? 'green',
            'is_reviewed'   => true,
            'reconciled_at' => now(),
        ]);

        // Learn from this manual/confirmed reconciliation
        try {
            $this->learnPattern($movement, $cfdi);
        } catch (\\Throwable $e) {
            // Best effort
        }

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

    private function findMatches(BankMovement $movement, Collection $cfdis, string $businessRfc, array $learnedPatterns): array
    {
        $isEgreso = $movement->cargo > 0;
        $amount   = $isEgreso ? $movement->cargo : $movement->abono;
        $movDate  = Carbon::parse($movement->date);

        $extractedName = $this->extractCounterpartName($movement->description, $isEgreso);
        $extractedRfc  = $this->extractRfc($movement->description);
        $learnedRfcs = $this->matchLearnedPatterns($movement->description, $learnedPatterns);

        $candidates = [];

        foreach ($cfdis as $cfdi) {
            if ($isEgreso  && !in_array($cfdi->tipo, ['E', 'P'])) continue;
            if (!$isEgreso && !in_array($cfdi->tipo, ['I', 'P'])) continue;

            if ($cfdi->moneda !== 'MXN' && $cfdi->tipo_cambio != 1) continue;

            if ($cfdi->tipo === 'I') {
                if (!$isEgreso && $cfdi->rfc_emisor !== $businessRfc) continue;
                if ($isEgreso && $cfdi->rfc_receptor !== $businessRfc) continue;
                if ($cfdi->metodo_pago === 'PPD') continue;
                if ($cfdi->metodo_pago === 'PUE') {
                    $cfdiDate = Carbon::parse($cfdi->fecha);
                    if ($cfdiDate->format('Y-m') !== $movDate->format('Y-m')) continue;
                }
            }

            if ($cfdi->tipo === 'E' && $cfdi->rfc_emisor !== $businessRfc) continue;

            if ($cfdi->tipo === 'P') {
                if (!$isEgreso && $cfdi->rfc_emisor  !== $businessRfc) continue;
                if ($isEgreso  && $cfdi->rfc_receptor !== $businessRfc) continue;

                $propios = $cfdi->pagosPropios;
                if ($propios->isEmpty()) continue;

                $repTotal  = (float) $propios->sum('monto_pagado');
                if (abs($repTotal - $amount) > 0.02) continue;

                $payDate  = Carbon::parse($propios->first()->fecha_pago);
                if ($payDate->format('Y-m') !== $movDate->format('Y-m')) continue;

                $daysDiff = (int) abs($movDate->diffInDays($payDate));
                $confidence = $this->computeConfidence($daysDiff, $cfdi, $businessRfc, $extractedRfc, $extractedName, $learnedRfcs, $isEgreso);
                $relatedUuids = $propios->pluck('uuid_relacionado')->filter()->values()->all();

                $candidates[] = [
                    'cfdi_id'          => $cfdi->id,
                    'uuid'             => $cfdi->uuid,
                    'rfc_emisor'       => $cfdi->rfc_emisor,
                    'rfc_receptor'     => $cfdi->rfc_receptor,
                    'name_emisor'      => $cfdi->name_emisor,
                    'name_receptor'    => $cfdi->name_receptor,
                    'fecha'            => $cfdi->fecha,
                    'fecha_pago'       => $payDate->toDateString(),
                    'forma_pago'       => $cfdi->forma_pago,
                    'total'            => round($repTotal, 2),
                    'tipo'             => 'P',
                    'confidence'       => $confidence,
                    'days_diff'        => $daysDiff,
                    'match_via'        => 'payment',
                    'related_invoices' => $relatedUuids,
                    'payments_count'   => $propios->count(),
                ];
                continue;
            }

            if (abs($cfdi->total - $amount) > 0.02) continue;

            $cfdiDate   = Carbon::parse($cfdi->fecha);
            $daysDiff   = (int) abs($movDate->diffInDays($cfdiDate));
            $confidence = $this->computeConfidence($daysDiff, $cfdi, $businessRfc, $extractedRfc, $extractedName, $learnedRfcs, $isEgreso);

            $candidates[] = [
                'cfdi_id'       => $cfdi->id,
                'uuid'          => $cfdi->uuid,
                'rfc_emisor'    => $cfdi->rfc_emisor,
                'rfc_receptor'  => $cfdi->rfc_receptor,
                'name_emisor'   => $cfdi->name_emisor,
                'name_receptor' => $cfdi->name_receptor,
                'fecha'         => $cfdi->fecha,
                'total'         => (float) $cfdi->total,
                'tipo'          => $cfdi->tipo,
                'confidence'    => $confidence,
                'days_diff'     => $daysDiff,
                'match_via'     => 'total',
            ];
        }

        usort($candidates, function ($a, $b) {
            $ra = $this->confidenceRank($a['confidence']);
            $rb = $this->confidenceRank($b['confidence']);
            if ($ra !== $rb) return $rb <=> $ra;
            $aIsRep = ($a['match_via'] === 'payment') ? 0 : 1;
            $bIsRep = ($b['match_via'] === 'payment') ? 0 : 1;
            if ($aIsRep !== $bIsRep) return $aIsRep <=> $bIsRep;
            return $a['days_diff'] <=> $b['days_diff'];
        });

        return $candidates;
    }

    private function computeConfidence(int $daysDiff, Cfdi $cfdi, string $businessRfc, ?string $extractedRfc, ?string $extractedName, array $learnedRfcs, bool $isEgreso): string {
        $counterpartRfc  = $isEgreso ? $cfdi->rfc_emisor  : $cfdi->rfc_receptor;
        $counterpartName = $isEgreso ? ($cfdi->name_emisor ?? '') : ($cfdi->name_receptor ?? '');
        if (in_array($counterpartRfc, $learnedRfcs)) return 'green';
        $rfcInDesc = $extractedRfc && $extractedRfc === $counterpartRfc;
        $nameMatch = $extractedName && $counterpartName && $this->nameMatches($extractedName, $counterpartName);
        $identityMatch = $rfcInDesc || $nameMatch;
        if ($identityMatch && $daysDiff <= 10) return 'green';
        if ($identityMatch) return 'yellow';
        if ($daysDiff <= 5) return 'yellow';
        return 'yellow'; 
    }

    private function confidenceRank(string $confidence): int {
        return match ($confidence) {
            'green'  => 3,
            'yellow' => 2,
            'red'    => 1,
            default  => 0,
        };
    }

    private function extractCounterpartName(string $description, bool $isEgreso): ?string {
        $desc = strtoupper($description);
        if ($isEgreso) {
            if (preg_match('/AL BENEF\\\\.?\\\\s+([A-ZÁÉÍÓÚÜÑ,\\\\/\\\\s]{4,60?})(?:\\\\s*[\\\\(\\\\[CTA]|$)/u', $desc, $m)) return trim($m[1]);
        } else {
            if (preg_match('/POR ORDEN DE\\\\s+(.{4,60?}?)(?:\\\\s+CTA\\\\.|$)/u', $desc, $m)) return trim($m[1]);
            if (preg_match('/CLIENTE:\\\\s+(.{4,60?}?)(?:\\\\s+P[AÁ]|$)/u', $desc, $m)) return trim($m[1]);
        }
        return null;
    }

    private function extractRfc(string $description): ?string {
        if (preg_match('/\\\\b([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})\\\\b/u', strtoupper($description), $m)) return $m[1];
        return null;
    }

    private function matchLearnedPatterns(string $description, array $learnedPatterns): array {
        $descUpper = strtoupper($description);
        $rfcs = [] ;
        foreach ($learnedPatterns as $keyword => $keywordRfcs) {
            if (str_contains($descUpper, strtoupper($keyword))) {
                foreach ($keywordRfcs as $rfc) $rfcs[] = $rfc;
            }
        }
        return array_unique($rfcs);
    }

    private function nameMatches(string $descName, string $cfdiName): bool {
        $normalize = fn($s) => strtoupper(preg_replace('/[^A-ZÁÉÍÓÚÜÑA-Z0-9\\\\s]/ui', '', $s));
        $desc = $normalize($descName); $cfdi = $normalize($cfdiName);
        $stopWords = ['SA', 'DE', 'CV', 'SC', 'SRL', 'SPR', 'DEL', 'LOS', 'LAS', 'EL', 'LA', 'Y'];
        $words = array_filter(explode(' ', $desc), fn($w) => strlen($w) >= 4 && !in_array($w, $stopWords));
        $matched = 0;
        foreach ($words as $word) { if (str_contains($cfdi, $word)) $matched++; }
        return $matched >= 1;
    }

    private function extractKeyword(string $description, bool $isEgreso): ?string {
        $name = $this->extractCounterpartName($description, $isEgreso);
        if ($name && strlen($name) >= 4) {
            $words = array_filter(explode(' ', $name), fn($w) => strlen($w) >= 3);
            $keyword = implode(' ', array_slice($words, 0, 3));
            return substr(strtoupper(trim($keyword)), 0, 60) ?: null;
        }
        $fallback = substr(strtoupper(preg_replace('/\\\\s+/', ' ', trim($description))), 0, 40);
        return strlen($fallback) >= 4 ? $fallback : null;
    }

    private function learnPattern(BankMovement $movement, Cfdi $cfdi): void {
        $businessId = $movement->statement?->business_id;
        if (!$businessId) return;
        $isEgreso = $movement->cargo > 0;
        $keyword  = $this->extractKeyword($movement->description, $isEgreso);
        if (!$keyword) return;
        $counterpartRfc = $isEgreso ? $cfdi->rfc_emisor : $cfdi->rfc_receptor;
        if (!$counterpartRfc) return;
        ReconciliationPattern::withoutTimestamps(function () use ($businessId, $keyword, $counterpartRfc) {
            $existing = ReconciliationPattern::where('business_id', $businessId)->where('description_keyword', $keyword)->where('counterpart_rfc', $counterpartRfc)->first();
            if ($existing) $existing->increment('confirmed_count');
            else ReconciliationPattern::create(['business_id' => $businessId, 'description_keyword' => $keyword, 'counterpart_rfc' => $counterpartRfc, 'confirmed_count' => 1]);
        });
    }
}
"""

with open(r'c:\Fiscalio\sat-api\app\Http\Controllers\ReconciliationController.php', 'w', encoding='utf-8') as f:
    f.write(content)
