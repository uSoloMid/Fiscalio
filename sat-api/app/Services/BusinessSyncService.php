<?php

namespace App\Services;

use App\Models\Business;
use App\Models\Cfdi;
use App\Models\SatRequest;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BusinessSyncService
{
    protected $statusService;

    public function __construct(SatStatusService $statusService)
    {
        $this->statusService = $statusService;
    }

    /**
     * Start a sync process for a business if needed.
     */
    public function syncIfNeeded(Business $business, bool $force = false)
    {
        // Threshold: 24 horas entre syncs para no saturar el SAT
        $syncThreshold = now()->subHours(24);

        if ($business->is_syncing && !$force) {
            return ['status' => 'already_syncing'];
        }

        if (!$force && $business->last_sync_at && $business->last_sync_at > $syncThreshold) {
            return ['status' => 'too_recent', 'last_sync' => $business->last_sync_at];
        }

        $business->update(['is_syncing' => true, 'sync_status' => 'checking']);

        try {
            $types = ['issued', 'received'];
            $requestCount = 0;

            foreach ($types as $type) {
                // Find the end_date of the last successful SAT request for this RFC and type
                $lastRequest = SatRequest::where('rfc', $business->rfc)
                    ->where('type', $type)
                    ->where('state', 'completed')
                    ->orderBy('end_date', 'desc')
                    ->first();

                $latestDate = $lastRequest ? $lastRequest->end_date : null;

                // Si no hay historial de solicitudes (posible limpieza manual), buscamos el último CFDI en la BD
                if (!$latestDate) {
                    $column = $type === 'issued' ? 'rfc_emisor' : 'rfc_receptor';
                    $latestCfdiDate = Cfdi::where($column, 'like', $business->rfc . '%')->max('fecha_fiscal');
                    if ($latestCfdiDate) {
                        $latestDate = $latestCfdiDate;
                        Log::info("Restableciendo punto de sincronización desde CFDI para {$business->rfc} ($type): $latestDate");
                    }
                }

                $totalEnd = now()->subMinutes(5);

                if (!$latestDate) {
                    // Primera vez: 1 sola solicitud para los últimos 5 años completos
                    $startDate = now()->subYears(5)->startOfYear();
                    $this->createRequestIfNotExists($business->rfc, $type, $startDate, $totalEnd, $force);
                    $requestCount++;
                    Log::info("Solicitud inicial creada para {$business->rfc} ($type): {$startDate->toDateString()} → {$totalEnd->toDateString()}");
                } else {
                    // Incremental: 1 solicitud desde el último completado hasta hoy
                    $startDate = Carbon::parse($latestDate)->subDays(2)->startOfDay();
                    if ($startDate < $totalEnd->copy()->subMinutes(30)) {
                        $created = $this->createRequestIfNotExists($business->rfc, $type, $startDate, $totalEnd, $force);
                        if ($created) {
                            $requestCount++;
                            Log::info("Solicitud incremental creada para {$business->rfc} ($type): {$startDate->toDateString()} → {$totalEnd->toDateString()}");
                        }
                    }
                }
            }

            $business->update([
                'is_syncing' => false,
                'last_sync_at' => now(),
                'sync_status' => 'queued'
            ]);

            // Verification is now handled by the scheduled SatRunJobsCommand 15m or manually.
            /*
             if (!$business->last_verification_at || $business->last_verification_at < now()->subHours(24)) {
             $this->verifyInvoices($business);
             }
             */

            return [
                'status' => 'success',
                'requests_created' => $requestCount,
                'last_sync' => now()->toDateTimeString()
            ];

        }
        catch (\Exception $e) {
            $business->update(['is_syncing' => false, 'sync_status' => 'error']);
            throw $e;
        }
    }

    /**
     * Verify status of all active invoices.
     */
    public function verifyInvoices(Business $business, array $filters = [])
    {
        // Limit to invoices not checked in last 24h and that are NOT canceled
        $query = Cfdi::where(function ($q) use ($business) {
            $q->where('rfc_emisor', $business->rfc)
                ->orWhere('rfc_receptor', $business->rfc);
        })
            ->where('es_cancelado', false);

        // Apply filters
        if (!empty($filters['year'])) {
            $query->whereYear('fecha', $filters['year']);
        }
        if (!empty($filters['month'])) {
            $query->whereMonth('fecha', $filters['month']);
        }
        if (!empty($filters['tipo']) && in_array($filters['tipo'], ['emitidas', 'recibidas'])) {
            if ($filters['tipo'] === 'emitidas') {
                $query->where('rfc_emisor', $business->rfc);
            }
            else {
                $query->where('rfc_receptor', $business->rfc);
            }
        }

        $query->where(function ($q) {
            $q->whereNull('estado_sat_updated_at')
                ->orWhere('estado_sat_updated_at', '<', now()->subHours(24));
        });

        $totalToVerify = $query->count();
        $invoices = $query->limit(500)->get(); // Aumentado a 500 para mayor efectividad en lotes grandes

        $changes = [];
        $verifiedCount = 0;

        foreach ($invoices as $cfdi) {
            $result = $this->statusService->checkStatus(
                $cfdi->uuid,
                $cfdi->rfc_emisor,
                $cfdi->rfc_receptor,
                number_format($cfdi->total, 2, '.', '')
            );

            if ($result['estado'] !== 'Error' && $result['estado'] !== 'No Encontrado') {
                $oldStatus = $cfdi->estado_sat;
                $newStatus = $result['estado'];

                if ($oldStatus !== $newStatus) {
                    $changes[] = [
                        'uuid' => $cfdi->uuid,
                        'rfc' => $cfdi->rfc_emisor === $business->rfc ? $cfdi->rfc_receptor : $cfdi->rfc_emisor,
                        'name' => $cfdi->rfc_emisor === $business->rfc ? $cfdi->name_receptor : $cfdi->name_emisor,
                        'total' => $cfdi->total,
                        'old_status' => $oldStatus,
                        'new_status' => $newStatus
                    ];
                }

                $cfdi->update([
                    'estado_sat' => $newStatus,
                    'estado_sat_updated_at' => now(),
                    'es_cancelado' => ($newStatus === 'Cancelado' ? 1 : 0),
                    'es_cancelable' => $result['es_cancelable'],
                    'estatus_cancelacion' => $result['estatus_cancelacion'],
                    'validacion_efos' => $result['validacion_efos'],
                ]);
            }
            $verifiedCount++;
        }

        $business->update(['last_verification_at' => now()]);

        return [
            'total_pending' => $totalToVerify,
            'verified_now' => $verifiedCount,
            'changes' => $changes
        ];
    }

    public function createManualRequest(Business $business, $startDate, $endDate, $type = 'all')
    {
        $start = Carbon::parse($startDate)->startOfDay();
        $end   = Carbon::parse($endDate)->endOfDay();

        $types = ($type === 'all') ? ['issued', 'received'] : [$type];
        $requestCount = 0;

        foreach ($types as $t) {
            $created = $this->createRequestIfNotExists($business->rfc, $t, $start, $end, false);
            if ($created) $requestCount++;
        }

        return [
            'status' => 'success',
            'requests_created' => $requestCount
        ];
    }

    /**
     * Detecta periodos sin cobertura (sin solicitud completed) para un RFC+tipo
     * en los últimos 5 años y crea solicitudes para cubrirlos.
     * Útil para clientes ya existentes que pueden tener huecos por solicitudes fallidas.
     */
    public function fillGaps(Business $business): array
    {
        $types = ['issued', 'received'];
        $requestCount = 0;
        $gapsFound = [];

        foreach ($types as $type) {
            $gaps = $this->getCoverageGaps($business->rfc, $type);
            foreach ($gaps as $gap) {
                $created = $this->createRequestIfNotExists($business->rfc, $type, $gap['start'], $gap['end'], false);
                if ($created) {
                    $requestCount++;
                    $gapsFound[] = [
                        'type'  => $type,
                        'start' => $gap['start']->toDateString(),
                        'end'   => $gap['end']->toDateString(),
                    ];
                    Log::info("Hueco rellenado para {$business->rfc} ($type): {$gap['start']->toDateString()} → {$gap['end']->toDateString()}");
                }
            }
        }

        return [
            'status'           => 'success',
            'requests_created' => $requestCount,
            'gaps_found'       => $gapsFound,
        ];
    }

    /**
     * Retorna el estado de cobertura de un cliente para mostrar en la UI.
     */
    public function getCoverageStatus(Business $business): array
    {
        $result = [];
        $expectedStart = now()->subYears(5)->startOfYear();
        $expectedEnd   = now()->subMinutes(5);
        $totalDays = $expectedStart->diffInDays($expectedEnd) ?: 1;

        foreach (['issued', 'received'] as $type) {
            $gaps = $this->getCoverageGaps($business->rfc, $type);

            $gapDays = 0;
            foreach ($gaps as $gap) {
                $gapDays += Carbon::parse($gap['start'])->diffInDays(Carbon::parse($gap['end']));
            }

            $coveredDays = max(0, $totalDays - $gapDays);
            $pct = round(($coveredDays / $totalDays) * 100, 1);

            $lastCompleted = SatRequest::where('rfc', $business->rfc)
                ->where('type', $type)
                ->where('state', 'completed')
                ->orderBy('end_date', 'desc')
                ->value('end_date');

            $result[$type] = [
                'covered_pct'  => $pct,
                'gaps_count'   => count($gaps),
                'last_covered' => $lastCompleted ? Carbon::parse($lastCompleted)->toDateString() : null,
            ];
        }

        return $result;
    }

    // ─── Helpers privados ────────────────────────────────────────────────────

    /**
     * Detecta huecos de cobertura para un RFC+tipo en los últimos 5 años.
     * Un "hueco" es un periodo sin ninguna solicitud en estado completed.
     * Tolerancia de 2 días entre solicitudes para evitar falsos positivos.
     */
    private function getCoverageGaps(string $rfc, string $type): array
    {
        $expectedStart = now()->subYears(5)->startOfYear();
        $expectedEnd   = now()->subMinutes(5);

        $completed = SatRequest::where('rfc', $rfc)
            ->where('type', $type)
            ->where('state', 'completed')
            ->where('end_date', '>=', $expectedStart)
            ->orderBy('start_date')
            ->get(['start_date', 'end_date']);

        $gaps   = [];
        $cursor = $expectedStart->copy();

        foreach ($completed as $req) {
            $reqStart = Carbon::parse($req->start_date);
            $reqEnd   = Carbon::parse($req->end_date);

            // Hay hueco si el inicio de esta solicitud es más de 2 días después del cursor
            if ($reqStart->gt($cursor->copy()->addDays(2))) {
                $gaps[] = ['start' => $cursor->copy(), 'end' => $reqStart->copy()];
            }

            if ($reqEnd->gt($cursor)) {
                $cursor = $reqEnd->copy();
            }
        }

        // Hueco desde el último completado hasta hoy (más de 2 días sin cubrir)
        if ($cursor->lt($expectedEnd->copy()->subDays(2))) {
            $gaps[] = ['start' => $cursor->copy(), 'end' => $expectedEnd->copy()];
        }

        return $gaps;
    }

    /**
     * Crea una solicitud SAT si no existe ya una activa o completada para ese rango exacto.
     * Retorna true si se creó, false si ya existía.
     */
    private function createRequestIfNotExists(string $rfc, string $type, Carbon $start, Carbon $end, bool $force): bool
    {
        $active = SatRequest::where('rfc', $rfc)
            ->where('type', $type)
            ->where('start_date', $start->toDateTimeString())
            ->where('end_date', $end->toDateTimeString())
            ->whereIn('state', ['created', 'polling', 'downloading'])
            ->exists();

        if ($active) return false;

        $completedExists = SatRequest::where('rfc', $rfc)
            ->where('type', $type)
            ->where('start_date', $start->toDateTimeString())
            ->where('end_date', $end->toDateTimeString())
            ->where('state', 'completed')
            ->exists();

        if ($completedExists && !$force) return false;

        SatRequest::create([
            'id'         => (string)\Illuminate\Support\Str::uuid(),
            'rfc'        => $rfc,
            'type'       => $type,
            'start_date' => $start,
            'end_date'   => $end,
            'state'      => 'created',
        ]);

        return true;
    }
}
