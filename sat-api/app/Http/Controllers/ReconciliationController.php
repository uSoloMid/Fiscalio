<?php

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
        $statement = BankStatement::with(['movements.cfdi', 'business'])->findOrFail($statementId);
        $business   = $statement->business;
        $businessRfc = $business->rfc;
        $businessId  = $business->id;

        // Load all valid CFDIs for this business (emitted or received), with both payment relationships
        $cfdis = Cfdi::where(function ($q) use ($businessRfc) {
                $q->where('rfc_emisor', $businessRfc)
                  ->orWhere('rfc_receptor', $businessRfc);
            })
            ->where('es_cancelado', 0)
            ->whereIn('tipo', ['I', 'E', 'P'])
            ->with(['pagosRelacionados', 'pagosPropios'])
            ->get();

        // Load learned patterns for this business: [description_keyword => [rfc, ...]]
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
        $this->learnPattern($movement, $cfdi);

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
    // Matching engine
    // -------------------------------------------------------------------------

    private function findMatches(BankMovement $movement, Collection $cfdis, string $businessRfc, array $learnedPatterns): array
    {
        $isEgreso = $movement->cargo > 0;
        $amount   = $isEgreso ? $movement->cargo : $movement->abono;
        $movDate  = Carbon::parse($movement->date);

        // Extract counterpart info from bank description (SPEI patterns)
        $extractedName = $this->extractCounterpartName($movement->description, $isEgreso);
        $extractedRfc  = $this->extractRfc($movement->description);

        // Check against learned patterns → set of RFCs we trust
        $learnedRfcs = $this->matchLearnedPatterns($movement->description, $learnedPatterns);

        $candidates = [];

        foreach ($cfdis as $cfdi) {
            // Direction filter
            if ($isEgreso && !in_array($cfdi->tipo, ['E', 'P'])) continue;
            if (!$isEgreso && $cfdi->tipo !== 'I') continue;

            // Skip foreign currency without exchange rate
            if ($cfdi->moneda !== 'MXN' && $cfdi->tipo_cambio != 1) continue;

            // ── REP (tipo P): match by SUM of all pagosPropios ──────────────
            if ($cfdi->tipo === 'P') {
                $propios = $cfdi->pagosPropios;
                if ($propios->isEmpty()) continue;

                $repTotal  = (float) $propios->sum('monto_pagado');
                if (abs($repTotal - $amount) > 0.02) continue;

                // Use the first payment's date as the REP date
                $payDate  = Carbon::parse($propios->first()->fecha_pago);
                $daysDiff = (int) abs($movDate->diffInDays($payDate));

                $confidence = $this->computeConfidence(
                    $daysDiff, $cfdi, $businessRfc, $extractedRfc, $extractedName, $learnedRfcs, $isEgreso
                );

                // Collect the related invoice UUIDs
                $relatedUuids = $propios->pluck('uuid_relacionado')->filter()->values()->all();

                $candidates[] = [
                    'cfdi_id'          => $cfdi->id,
                    'uuid'             => $cfdi->uuid,
                    'rfc_emisor'       => $cfdi->rfc_emisor,
                    'rfc_receptor'     => $cfdi->rfc_receptor,
                    'name_emisor'      => $cfdi->name_emisor,
                    'name_receptor'    => $cfdi->name_receptor,
                    'fecha'            => $cfdi->fecha,
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

            // ── Ingreso / Egreso (PUE): match by cfdi->total ────────────────
            if (abs($cfdi->total - $amount) > 0.02) continue;

            $cfdiDate   = Carbon::parse($cfdi->fecha);
            $daysDiff   = (int) abs($movDate->diffInDays($cfdiDate));
            $confidence = $this->computeConfidence(
                $daysDiff, $cfdi, $businessRfc, $extractedRfc, $extractedName, $learnedRfcs, $isEgreso
            );

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

        // Sort: green > yellow > red; REP first within tier; then closest date
        usort($candidates, function ($a, $b) {
            $ra = $this->confidenceRank($a['confidence']);
            $rb = $this->confidenceRank($b['confidence']);
            if ($ra !== $rb) return $rb <=> $ra;
            // REP before PUE within same tier
            $aIsRep = ($a['match_via'] === 'payment') ? 0 : 1;
            $bIsRep = ($b['match_via'] === 'payment') ? 0 : 1;
            if ($aIsRep !== $bIsRep) return $aIsRep <=> $bIsRep;
            // Closest date first
            return $a['days_diff'] <=> $b['days_diff'];
        });

        return $candidates;
    }

    // -------------------------------------------------------------------------
    // Confidence scoring
    // -------------------------------------------------------------------------

    private function computeConfidence(
        int $daysDiff,
        Cfdi $cfdi,
        string $businessRfc,
        ?string $extractedRfc,
        ?string $extractedName,
        array $learnedRfcs,
        bool $isEgreso
    ): string {
        $counterpartRfc  = $isEgreso ? $cfdi->rfc_emisor  : $cfdi->rfc_receptor;
        $counterpartName = $isEgreso ? ($cfdi->name_emisor ?? '') : ($cfdi->name_receptor ?? '');
        $ownRfcMatch     = ($cfdi->rfc_emisor === $businessRfc || $cfdi->rfc_receptor === $businessRfc);

        // Learned pattern — strongest signal
        if (in_array($counterpartRfc, $learnedRfcs)) return 'green';

        // RFC extracted from description matches CFDI counterpart
        $rfcInDesc  = $extractedRfc && $extractedRfc === $counterpartRfc;

        // Name extracted from description partially matches CFDI name
        $nameMatch  = $extractedName && $counterpartName && $this->nameMatches($extractedName, $counterpartName);

        $identityMatch = $rfcInDesc || $nameMatch;

        if ($identityMatch && $daysDiff <= 10) return 'green';
        if ($ownRfcMatch  && $daysDiff <= 5)  return 'green';
        if ($identityMatch)                    return 'yellow';
        if ($ownRfcMatch  && $daysDiff <= 30)  return 'yellow';
        if ($daysDiff <= 5)                    return 'yellow';
        return 'yellow'; // exact amount always at least yellow
    }

    private function confidenceRank(string $confidence): int
    {
        return match ($confidence) {
            'green'  => 3,
            'yellow' => 2,
            'red'    => 1,
            default  => 0,
        };
    }

    // -------------------------------------------------------------------------
    // Description parsing — Mexican SPEI patterns
    // -------------------------------------------------------------------------

    /**
     * Extract the counterpart's name from common Mexican bank transfer descriptions.
     * Egreso: look for "AL BENEF" pattern (recipient)
     * Ingreso: look for "POR ORDEN DE" pattern (sender)
     */
    private function extractCounterpartName(string $description, bool $isEgreso): ?string
    {
        $desc = strtoupper($description);

        if ($isEgreso) {
            // "AL BENEF. NOMBRE APELLIDO (DATO NO VERIFICADO..."
            // "AL BENEF NOMBRE APELLIDO CTA.BENEFICIARIO..."
            if (preg_match('/AL BENEF\.?\s+([A-ZÁÉÍÓÚÜÑ,\/\s]{4,60?})(?:\s*[\(\[CTA]|$)/u', $desc, $m)) {
                return trim($m[1]);
            }
        } else {
            // "POR ORDEN DE NOMBRE APELLIDO CTA.ORDENANTE..."
            if (preg_match('/POR ORDEN DE\s+(.{4,60?}?)(?:\s+CTA\.|$)/u', $desc, $m)) {
                return trim($m[1]);
            }
            // "CLIENTE: NOMBRE ..."
            if (preg_match('/CLIENTE:\s+(.{4,60?}?)(?:\s+P[AÁ]|$)/u', $desc, $m)) {
                return trim($m[1]);
            }
        }

        return null;
    }

    /**
     * Extract a Mexican RFC from the description (format: 3-4 letters + 6 digits + 3 alphanumeric).
     */
    private function extractRfc(string $description): ?string
    {
        if (preg_match('/\b([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})\b/u', strtoupper($description), $m)) {
            return $m[1];
        }
        return null;
    }

    /**
     * Check if any learned pattern keyword is contained in the description.
     * Returns array of RFCs that are trusted for this description.
     */
    private function matchLearnedPatterns(string $description, array $learnedPatterns): array
    {
        $descUpper = strtoupper($description);
        $rfcs = [];
        foreach ($learnedPatterns as $keyword => $keywordRfcs) {
            if (str_contains($descUpper, strtoupper($keyword))) {
                foreach ($keywordRfcs as $rfc) {
                    $rfcs[] = $rfc;
                }
            }
        }
        return array_unique($rfcs);
    }

    /**
     * Fuzzy name match: check if meaningful words from $descName appear in $cfdiName.
     */
    private function nameMatches(string $descName, string $cfdiName): bool
    {
        $normalize = fn($s) => strtoupper(preg_replace('/[^A-ZÁÉÍÓÚÜÑA-Z0-9\s]/ui', '', $s));
        $desc = $normalize($descName);
        $cfdi = $normalize($cfdiName);

        // Skip common noise words
        $stopWords = ['SA', 'DE', 'CV', 'SC', 'SRL', 'SPR', 'DEL', 'LOS', 'LAS', 'EL', 'LA', 'Y'];

        $words = array_filter(
            explode(' ', $desc),
            fn($w) => strlen($w) >= 4 && !in_array($w, $stopWords)
        );

        $matched = 0;
        foreach ($words as $word) {
            if (str_contains($cfdi, $word)) $matched++;
        }

        return $matched >= 1;
    }

    // -------------------------------------------------------------------------
    // Learning
    // -------------------------------------------------------------------------

    /**
     * Extract a stable keyword from the description (the counterpart name portion).
     * Used as the pattern key for future matches.
     */
    private function extractKeyword(string $description, bool $isEgreso): ?string
    {
        $name = $this->extractCounterpartName($description, $isEgreso);
        if ($name && strlen($name) >= 4) {
            // Keep first 3 meaningful words, max 60 chars
            $words = array_filter(explode(' ', $name), fn($w) => strlen($w) >= 3);
            $keyword = implode(' ', array_slice($words, 0, 3));
            return substr(strtoupper(trim($keyword)), 0, 60) ?: null;
        }

        // Fallback: first 40 chars of description (normalized)
        $fallback = substr(strtoupper(preg_replace('/\s+/', ' ', trim($description))), 0, 40);
        return strlen($fallback) >= 4 ? $fallback : null;
    }

    private function learnPattern(BankMovement $movement, Cfdi $cfdi): void
    {
        $businessId = $movement->statement?->business_id;
        if (!$businessId) return;

        $isEgreso = $movement->cargo > 0;
        $keyword  = $this->extractKeyword($movement->description, $isEgreso);
        if (!$keyword) return;

        $counterpartRfc = $isEgreso ? $cfdi->rfc_emisor : $cfdi->rfc_receptor;
        if (!$counterpartRfc) return;

        ReconciliationPattern::withoutTimestamps(function () use ($businessId, $keyword, $counterpartRfc) {
            $existing = ReconciliationPattern::where('business_id', $businessId)
                ->where('description_keyword', $keyword)
                ->where('counterpart_rfc', $counterpartRfc)
                ->first();

            if ($existing) {
                $existing->increment('confirmed_count');
            } else {
                ReconciliationPattern::create([
                    'business_id'         => $businessId,
                    'description_keyword' => $keyword,
                    'counterpart_rfc'     => $counterpartRfc,
                    'confirmed_count'     => 1,
                ]);
            }
        });
    }
}
