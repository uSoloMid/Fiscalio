<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\BankStatement;
use App\Models\BankMovement;
use App\Models\Cfdi;
use App\Models\ReconciliationPattern;
use App\Models\Business;
use App\Models\CfdiPayment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ReconciliationController extends Controller
{
    public function suggest(Request $request, $statementId)
    {
        ini_set('memory_limit', '512M');
        set_time_limit(120);

        $statement = BankStatement::with(['movements.cfdis', 'business'])->findOrFail($statementId);
        $business   = $statement->business;
        $businessRfc = $business->rfc;
        $businessId  = $business->id;

        // Collect CFDIs already linked to movements for this business (to exclude from suggestions)
        $linkedIds = DB::table('bank_movement_cfdis')
            ->join('bank_movements', 'bank_movements.id', '=', 'bank_movement_cfdis.bank_movement_id')
            ->join('bank_statements', 'bank_statements.id', '=', 'bank_movements.bank_statement_id')
            ->where('bank_statements.business_id', $businessId)
            ->pluck('bank_movement_cfdis.cfdi_id')
            ->unique()->values()->all();

        // Also exclude invoices covered by already-linked REPs
        if (!empty($linkedIds)) {
            $repUuids = Cfdi::whereIn('id', $linkedIds)->where('tipo', 'P')->pluck('uuid')->all();
            if (!empty($repUuids)) {
                $relUuids = \App\Models\CfdiPayment::whereIn('uuid_pago', $repUuids)
                    ->pluck('uuid_relacionado')->all();
                if (!empty($relUuids)) {
                    $relIds = Cfdi::whereIn('uuid', $relUuids)->pluck('id')->all();
                    $linkedIds = array_values(array_unique(array_merge($linkedIds, $relIds)));
                }
            }
        }

        // Load all valid CFDIs for this business, optimized memory by selecting only necessary columns
        $query = Cfdi::select([
                'id', 'uuid', 'rfc_emisor', 'rfc_receptor', 'name_emisor', 'name_receptor',
                'fecha', 'nomina_fecha_pago', 'total', 'tipo', 'metodo_pago', 'forma_pago', 'moneda', 'tipo_cambio', 'es_cancelado', 'traslados_locales', 'retenciones_locales'
            ])
            ->where(function ($q) use ($businessRfc) {
                $q->where('rfc_emisor', $businessRfc)
                  ->orWhere('rfc_receptor', $businessRfc);
            })
            ->where('es_cancelado', 0)
            ->whereIn('tipo', ['I', 'E', 'P', 'N'])
            ->when(!empty($linkedIds), fn($q) => $q->whereNotIn('id', $linkedIds));

        // Optimization: limit search range near the statement period if available
        if ($statement->period && preg_match('/^([A-Z]{3})-(\d{4})$/', $statement->period, $m)) {
            $monthsMap = ['ENE' => 1, 'FEB' => 2, 'MAR' => 3, 'ABR' => 4, 'MAY' => 5, 'JUN' => 6, 'JUL' => 7, 'AGO' => 8, 'SEP' => 9, 'OCT' => 10, 'NOV' => 11, 'DIC' => 12];
            $month = $monthsMap[$m[1]] ?? 0;
            $year = (int)$m[2];
            if ($month > 0) {
                // Expand range: 2 months before and up to the end of the next month
                $startDate = Carbon::create($year, $month, 1)->subMonths(2)->startOfMonth();
                $endDate = Carbon::create($year, $month, 1)->addMonth()->endOfMonth(); 
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

            if ($movement->cfdis->isNotEmpty()) {
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
        $confidence = $request->confidence ?? 'green';

        // Add to junction table (ignore if already linked)
        DB::table('bank_movement_cfdis')->insertOrIgnore([
            'bank_movement_id' => $movement->id,
            'cfdi_id'          => $request->cfdi_id,
            'confidence'       => $confidence,
            'created_at'       => now(),
        ]);

        // Update movement status fields
        $movement->update([
            'is_reviewed'   => true,
            'reconciled_at' => $movement->reconciled_at ?? now(),
            'confidence'    => $confidence,
        ]);

        // Learn from this manual/confirmed reconciliation
        try {
            $this->learnPattern($movement, $cfdi);
        } catch (\Throwable $e) {
            // Best effort
        }

        return response()->json([
            'success'  => true,
            'movement' => $movement->fresh()->load('cfdis'),
        ]);
    }

    public function unreconcile(Request $request, $id)
    {
        $movement = BankMovement::findOrFail($id);
        $cfdiId   = $request->query('cfdi_id');

        if ($cfdiId) {
            // Remove specific CFDI link
            DB::table('bank_movement_cfdis')
                ->where('bank_movement_id', $movement->id)
                ->where('cfdi_id', $cfdiId)
                ->delete();
        } else {
            // Remove all links
            DB::table('bank_movement_cfdis')
                ->where('bank_movement_id', $movement->id)
                ->delete();
        }

        // If no links remain, reset movement status
        $remaining = DB::table('bank_movement_cfdis')
            ->where('bank_movement_id', $movement->id)
            ->count();

        if ($remaining === 0) {
            $movement->update([
                'is_reviewed'   => false,
                'confidence'    => null,
                'reconciled_at' => null,
            ]);
        }

        return response()->json([
            'success'  => true,
            'movement' => $movement->fresh()->load('cfdis'),
        ]);
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
            // Basic filtering based on Business participation
            if ($cfdi->tipo === 'N') {
                // Nómina: only for egreso (we pay employees), we are always emisor
                if (!$isEgreso || $cfdi->rfc_emisor !== $businessRfc) continue;
            } elseif ($isEgreso) {
                // For money out (cargos), we want:
                // 1. Invoices from suppliers (tipo I, we are receptor) - GASTOS
                // 2. Payments to suppliers (tipo P, we are receptor) - REPs
                // 3. Credit notes we issued (tipo E, we are emisor)
                if ($cfdi->tipo === 'I' && $cfdi->rfc_receptor !== $businessRfc) continue;
                if ($cfdi->tipo === 'P' && $cfdi->rfc_receptor !== $businessRfc) continue;
                if ($cfdi->tipo === 'E' && $cfdi->rfc_emisor !== $businessRfc) continue;
            } else {
                // For money in (abonos), we want:
                // 1. Invoices to clients (tipo I, we are emisor) - INGRESOS
                // 2. Payments from clients (tipo P, we are emisor) - REPs
                // 3. Credit notes from suppliers (tipo E, we are receptor)
                if ($cfdi->tipo === 'I' && $cfdi->rfc_emisor !== $businessRfc) continue;
                if ($cfdi->tipo === 'P' && $cfdi->rfc_emisor !== $businessRfc) continue;
                if ($cfdi->tipo === 'E' && $cfdi->rfc_receptor !== $businessRfc) continue;
            }

            // Simple currency check for now
            if ($cfdi->moneda !== 'MXN' && $cfdi->tipo_cambio != 1) continue;

            $cfdiDate = Carbon::parse($cfdi->fecha);

            if ($cfdi->tipo === 'P') {
                $propios = $cfdi->pagosPropios;
                if ($propios->isEmpty()) continue;

                $repTotal  = (float) $propios->sum('monto_pagado');
                if (abs($repTotal - $amount) > 0.05) continue; 

                $pagoData = $propios->first();
                $payDate  = Carbon::parse($pagoData->fecha_pago);
                
                $daysDiff = (int) abs($movDate->diffInDays($payDate));
                if ($daysDiff > 35) continue;

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

            if (abs($cfdi->total - $amount) > 0.05) continue;

            // Nómina: use FechaPago from complement (tighter window ±20 days); fallback to fecha
            if ($cfdi->tipo === 'N') {
                $matchDate = $cfdi->nomina_fecha_pago
                    ? Carbon::parse($cfdi->nomina_fecha_pago)
                    : $cfdiDate;
                $daysDiff = (int) abs($movDate->diffInDays($matchDate));
                if ($daysDiff > 20) continue;
            } else {
                $daysDiff = (int) abs($movDate->diffInDays($cfdiDate));
                if ($daysDiff > 45) continue;
            }

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
            
            $aIsP = $a['tipo'] === 'P' ? 1 : 0;
            $bIsP = $b['tipo'] === 'P' ? 1 : 0;
            if ($aIsP !== $bIsP) return $bIsP <=> $aIsP;

            return $a['days_diff'] <=> $b['days_diff'];
        });

        return $candidates;
    }

    private function computeConfidence(int $daysDiff, Cfdi $cfdi, string $businessRfc, ?string $extractedRfc, ?string $extractedName, array $learnedRfcs, bool $isEgreso): string {
        // Nómina: el negocio es emisor, la contraparte es el receptor (empleado)
        if ($cfdi->tipo === 'N') {
            $counterpartRfc  = $cfdi->rfc_receptor;
            $counterpartName = $cfdi->name_receptor ?? '';
        } else {
            $counterpartRfc  = $isEgreso ? $cfdi->rfc_emisor  : $cfdi->rfc_receptor;
            $counterpartName = $isEgreso ? ($cfdi->name_emisor ?? '') : ($cfdi->name_receptor ?? '');
        }
        
        $isLearned = in_array($counterpartRfc, $learnedRfcs);
        $rfcInDesc = $extractedRfc && $extractedRfc === $counterpartRfc;
        $nameMatch = $extractedName && $counterpartName && $this->nameMatches($extractedName, $counterpartName);
        
        $identityMatch = $isLearned || $rfcInDesc || $nameMatch;

        if ($identityMatch && $daysDiff <= 15) return 'green';
        if ($identityMatch && $daysDiff <= 32) return 'green'; 
        if ($identityMatch) return 'yellow';
        if ($daysDiff <= 3) return 'yellow';
        
        return 'red'; 
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
        
        // Remove common noisy prefixes/suffixes
        $noise = ['SPEI RECIBIDO', 'SPEI ENVIADO', 'TRANSFERENCIA INTERBANCARIA', 'TRASPASO ENTRE CUENTAS', 'PAGO FACTURA', 'IVA', 'RET', 'COMPRA', 'PAGO EN'];
        foreach ($noise as $n) $desc = str_replace($n, '', $desc);

        if ($isEgreso) {
            // Banamex / Generic "Beneficiary"
            if (preg_match('/AL BENEF\\.?\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})(?:\\s*[\\(\\[CTA]|$)/u', $desc, $m)) return trim($m[1]);
            // BBVA / SPEI
            if (preg_match('/SPEI\\s+A\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})/u', $desc, $m)) return trim($m[1]);
            // Generic "Pago a"
            if (preg_match('/PAGO\\s+A\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})/u', $desc, $m)) return trim($m[1]);
            // Santander / Banorte Transfers
            if (preg_match('/(?:TRF|TRANSF)\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})(?:\\s+\\d{4,}|$)/u', $desc, $m)) return trim($m[1]);
        } else {
            // "Por orden de" (Received SPEI)
            if (preg_match('/POR ORDEN DE\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})(?:\\s+CTA\\.|$)/u', $desc, $m)) return trim($m[1]);
            // BBVA / SPEI Recibido
            if (preg_match('/SPEI\\s+DE\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})/u', $desc, $m)) return trim($m[1]);
            // "Cliente"
            if (preg_match('/CLIENTE:\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})(?:\\s+P[AÁ]|$)/u', $desc, $m)) return trim($m[1]);
            // Generic Depositor
            if (preg_match('/DEP\\d?\\s+([A-ZÁÉÍÓÚÜÑ,\\/\\s.]{4,60?})/u', $desc, $m)) return trim($m[1]);
        }
        
        $cleaned = trim(preg_replace('/\\s+/', ' ', $desc));
        if (strlen($cleaned) >= 5 && strlen($cleaned) <= 60 && !preg_match('/\\d{5,}/', $cleaned)) {
            return $cleaned;
        }

        return null;
    }

    private function extractRfc(string $description): ?string {
        if (preg_match('/\\b([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})\\b/u', strtoupper($description), $m)) return $m[1];
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
        $normalize = fn($s) => strtoupper(preg_replace('/[^A-ZÁÉÍÓÚÜÑA-Z0-9\\s]/ui', '', $s));
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
        $fallback = substr(strtoupper(preg_replace('/\\s+/', ' ', trim($description))), 0, 40);
        return strlen($fallback) >= 4 ? $fallback : null;
    }

    private function learnPattern(BankMovement $movement, Cfdi $cfdi): void {
        $businessId = $movement->statement?->business_id;
        if (!$businessId) return;
        $isEgreso = $movement->cargo > 0;
        $keyword  = $this->extractKeyword($movement->description, $isEgreso);
        if (!$keyword) return;
        $counterpartRfc = $cfdi->tipo === 'N' ? $cfdi->rfc_receptor : ($isEgreso ? $cfdi->rfc_emisor : $cfdi->rfc_receptor);
        if (!$counterpartRfc) return;
        ReconciliationPattern::withoutTimestamps(function () use ($businessId, $keyword, $counterpartRfc) {
            $existing = ReconciliationPattern::where('business_id', $businessId)->where('description_keyword', $keyword)->where('counterpart_rfc', $counterpartRfc)->first();
            if ($existing) $existing->increment('confirmed_count');
            else ReconciliationPattern::create(['business_id' => $businessId, 'description_keyword' => $keyword, 'counterpart_rfc' => $counterpartRfc, 'confirmed_count' => 1]);
        });
    }

    public function pendingReport(Request $request)
    {
        $request->validate(['rfc' => 'required|string']);

        $rfc  = strtoupper(trim($request->rfc));
        $from = $request->query('from'); // 'YYYY-MM-DD' opcional
        $to   = $request->query('to');   // 'YYYY-MM-DD' opcional

        $business   = Business::where('rfc', $rfc)->firstOrFail();
        $businessId = $business->id;

        $statementsCount = BankStatement::where('business_id', $businessId)->count();

        // IDs de CFDIs ya vinculados a movimientos bancarios de esta empresa
        $linkedCfdiIds = DB::table('bank_movement_cfdis')
            ->join('bank_movements', 'bank_movements.id', '=', 'bank_movement_cfdis.bank_movement_id')
            ->join('bank_statements', 'bank_statements.id', '=', 'bank_movements.bank_statement_id')
            ->where('bank_statements.business_id', $businessId)
            ->pluck('bank_movement_cfdis.cfdi_id')
            ->unique()->values()->all();
        $excludeIds = $linkedCfdiIds ?: [0];

        $cfdiSelect = ['id', 'uuid', 'serie', 'folio', 'fecha', 'rfc_emisor', 'rfc_receptor',
                       'name_emisor', 'name_receptor', 'total', 'tipo', 'metodo_pago', 'moneda', 'concepto'];

        $applyDate = function ($q) use ($from, $to) {
            if ($from) $q->where('fecha', '>=', $from);
            if ($to)   $q->where('fecha', '<=', $to . ' 23:59:59');
        };

        // ── 1. MOVIMIENTOS SIN CONCILIAR ─────────────────────────────────────
        $reconciledMovIds = DB::table('bank_movement_cfdis')
            ->join('bank_movements', 'bank_movements.id', '=', 'bank_movement_cfdis.bank_movement_id')
            ->join('bank_statements', 'bank_statements.id', '=', 'bank_movements.bank_statement_id')
            ->where('bank_statements.business_id', $businessId)
            ->pluck('bank_movement_cfdis.bank_movement_id')
            ->unique()->values()->all();

        $movQ = BankMovement::with('statement:id,bank_name,period,account_number')
            ->whereNotIn('id', $reconciledMovIds ?: [0])
            ->whereHas('statement', fn($q) => $q->where('business_id', $businessId));
        if ($from) $movQ->where('date', '>=', $from);
        if ($to)   $movQ->where('date', '<=', $to);
        $movimientos = $movQ->orderBy('date')
            ->get(['id', 'bank_statement_id', 'date', 'description', 'reference', 'cargo', 'abono', 'confidence']);

        $movsSinConciliar = [
            'ingresos'       => $movimientos->where('abono', '>', 0)->values(),
            'egresos'        => $movimientos->where('cargo', '>', 0)->values(),
            'total_ingresos' => round($movimientos->sum('abono'), 2),
            'total_egresos'  => round($movimientos->sum('cargo'), 2),
            'count'          => $movimientos->count(),
        ];

        // ── 2. PUE SIN BANCO ─────────────────────────────────────────────────
        $pueQ = Cfdi::select($cfdiSelect)
            ->where(fn($q) => $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc))
            ->whereIn('tipo', ['I', 'E'])
            ->where('metodo_pago', 'PUE')
            ->where('es_cancelado', 0)
            ->whereNotIn('id', $excludeIds);
        $applyDate($pueQ);
        $pueAll = $pueQ->orderByDesc('fecha')->get();

        $puePorCobrar = $pueAll->filter(fn($c) => $c->rfc_emisor === $rfc && $c->tipo === 'I')->values();
        $puePorPagar  = $pueAll->filter(fn($c) => $c->rfc_receptor === $rfc && $c->rfc_emisor !== $rfc)->values();

        // Nóminas sin banco (siempre son egresos: el negocio paga a empleados)
        $nomQ = Cfdi::select($cfdiSelect)
            ->where('rfc_emisor', $rfc)
            ->where('tipo', 'N')
            ->where('es_cancelado', 0)
            ->whereNotIn('id', $excludeIds);
        $applyDate($nomQ);
        $nominas = $nomQ->orderByDesc('fecha')->get();

        $pueSinBanco = [
            'por_cobrar'        => $puePorCobrar,
            'por_pagar'         => $puePorPagar,
            'nominas'           => $nominas,
            'total_por_cobrar'  => round($puePorCobrar->sum('total'), 2),
            'total_por_pagar'   => round($puePorPagar->sum('total'), 2),
            'total_nominas'     => round($nominas->sum('total'), 2),
            'count'             => $puePorCobrar->count() + $puePorPagar->count() + $nominas->count(),
        ];

        // ── 3 & 4. PPD: sin REP / parcialmente pagados ───────────────────────
        $uuidsConPago = CfdiPayment::pluck('uuid_relacionado')->unique()->values()->all();
        $uuidsConPagoOr = $uuidsConPago ?: ['__none__'];

        $ppdBaseQ = fn() => Cfdi::select($cfdiSelect)
            ->where(fn($q) => $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc))
            ->whereIn('tipo', ['I', 'E'])
            ->where('metodo_pago', 'PPD')
            ->where('es_cancelado', 0);

        // PPD sin ningún REP
        $ppdSinRepQ = $ppdBaseQ()->whereNotIn('uuid', $uuidsConPagoOr);
        $applyDate($ppdSinRepQ);
        $ppdSinRepAll = $ppdSinRepQ->orderByDesc('fecha')->get();

        $ppdSinRep = [
            'por_cobrar'        => $ppdSinRepAll->filter(fn($c) => $c->rfc_emisor === $rfc && $c->tipo === 'I')->values(),
            'por_pagar'         => $ppdSinRepAll->filter(fn($c) => $c->rfc_receptor === $rfc && $c->rfc_emisor !== $rfc)->values(),
        ];
        $ppdSinRep['total_por_cobrar'] = round($ppdSinRep['por_cobrar']->sum('total'), 2);
        $ppdSinRep['total_por_pagar']  = round($ppdSinRep['por_pagar']->sum('total'), 2);
        $ppdSinRep['count']            = $ppdSinRep['por_cobrar']->count() + $ppdSinRep['por_pagar']->count();

        // PPD con al menos un pago → filtrar los que aún tienen saldo pendiente
        $ppdConPagoQ = $ppdBaseQ()->whereIn('uuid', $uuidsConPagoOr);
        $applyDate($ppdConPagoQ);
        $ppdConPagoAll = $ppdConPagoQ->orderByDesc('fecha')->get();

        $ppdParcialAll = $ppdConPagoAll->filter(function ($cfdi) {
            $last = CfdiPayment::where('uuid_relacionado', $cfdi->uuid)
                ->orderByDesc('fecha_pago')->orderByDesc('num_parcialidad')->first();
            if (!$last) return false;
            $cfdi->saldo_insoluto      = round((float) $last->saldo_insoluto, 2);
            $cfdi->ultimo_pago_fecha   = $last->fecha_pago;
            $cfdi->num_parcialidades   = CfdiPayment::where('uuid_relacionado', $cfdi->uuid)->count();
            return $last->saldo_insoluto > 0.01;
        })->values();

        $ppdParciales = [
            'por_cobrar'             => $ppdParcialAll->filter(fn($c) => $c->rfc_emisor === $rfc && $c->tipo === 'I')->values(),
            'por_pagar'              => $ppdParcialAll->filter(fn($c) => $c->rfc_receptor === $rfc && $c->rfc_emisor !== $rfc)->values(),
        ];
        $ppdParciales['total_saldo_por_cobrar'] = round($ppdParciales['por_cobrar']->sum('saldo_insoluto'), 2);
        $ppdParciales['total_saldo_por_pagar']  = round($ppdParciales['por_pagar']->sum('saldo_insoluto'), 2);
        $ppdParciales['count']                  = $ppdParciales['por_cobrar']->count() + $ppdParciales['por_pagar']->count();

        // ── 5. REP SIN BANCO ─────────────────────────────────────────────────
        $repQ = Cfdi::select($cfdiSelect)
            ->where(fn($q) => $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc))
            ->where('tipo', 'P')
            ->where('es_cancelado', 0)
            ->whereNotIn('id', $excludeIds);
        $applyDate($repQ);
        $repAll = $repQ->orderByDesc('fecha')->get();

        $repSinBanco = [
            'emitidos'        => $repAll->filter(fn($c) => $c->rfc_emisor === $rfc)->values(),
            'recibidos'       => $repAll->filter(fn($c) => $c->rfc_receptor === $rfc && $c->rfc_emisor !== $rfc)->values(),
        ];
        $repSinBanco['total_emitidos']  = round($repSinBanco['emitidos']->sum('total'), 2);
        $repSinBanco['total_recibidos'] = round($repSinBanco['recibidos']->sum('total'), 2);
        $repSinBanco['count']           = $repSinBanco['emitidos']->count() + $repSinBanco['recibidos']->count();

        return response()->json([
            'rfc'                      => $rfc,
            'has_statements'           => $statementsCount > 0,
            'statements_count'         => $statementsCount,
            'filters'                  => ['from' => $from, 'to' => $to],
            'movimientos_sin_conciliar' => $movsSinConciliar,
            'pue_sin_banco'            => $pueSinBanco,
            'ppd_sin_rep'              => $ppdSinRep,
            'ppd_parciales'            => $ppdParciales,
            'rep_sin_banco'            => $repSinBanco,
        ]);
    }

    public function searchCfdis(Request $request)
    {
        $request->validate([
            'rfc'       => 'required|string',
            'q'         => 'required|string|min:2',
            'direction' => 'nullable|in:egreso,ingreso',
        ]);

        $businessRfc = strtoupper(trim($request->rfc));
        $q           = trim($request->q);
        $isEgreso    = $request->direction === 'egreso';

        $cfdis = Cfdi::select([
                'id', 'uuid', 'rfc_emisor', 'rfc_receptor', 'name_emisor', 'name_receptor',
                'fecha', 'nomina_fecha_pago', 'total', 'tipo', 'metodo_pago', 'forma_pago',
            ])
            ->where(function ($sq) use ($businessRfc) {
                $sq->where('rfc_emisor', $businessRfc)
                   ->orWhere('rfc_receptor', $businessRfc);
            })
            ->where('es_cancelado', 0)
            ->whereIn('tipo', ['I', 'E', 'P', 'N'])
            ->where(function ($sq) use ($q) {
                $sq->where('uuid', 'like', "%{$q}%")
                   ->orWhere('rfc_emisor', 'like', "%{$q}%")
                   ->orWhere('rfc_receptor', 'like', "%{$q}%")
                   ->orWhere('name_emisor', 'like', "%{$q}%")
                   ->orWhere('name_receptor', 'like', "%{$q}%");
            })
            ->orderByDesc('fecha')
            ->limit(30)
            ->get();

        return response()->json(['cfdis' => $cfdis]);
    }
}
