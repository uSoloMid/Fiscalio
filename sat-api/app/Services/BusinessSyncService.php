<?php

namespace App\Services;

use App\Models\Business;
use App\Models\Cfdi;
use App\Models\SatRequest;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

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
    public function syncIfNeeded(Business $business)
    {
        // Threshold: 12 hours since last sync check
        $syncThreshold = now()->subHours(12);

        if ($business->is_syncing) {
            return ['status' => 'already_syncing'];
        }

        if ($business->last_sync_at && $business->last_sync_at > $syncThreshold) {
            return ['status' => 'too_recent', 'last_sync' => $business->last_sync_at];
        }

        $business->update(['is_syncing' => true, 'sync_status' => 'checking']);

        try {
            $types = ['issued', 'received'];
            $requestCount = 0;

            foreach ($types as $type) {
                // Find latest invoice date for this business and type
                $query = Cfdi::query();
                if ($type === 'issued') {
                    $query->where('rfc_emisor', $business->rfc);
                }
                else {
                    $query->where('rfc_receptor', $business->rfc);
                }

                $latestDate = $query->max('fecha');

                if (!$latestDate) {
                    // Initial sync: 5 years back
                    $startDate = now()->subYears(5)->startOfYear();
                }
                else {
                    // Incremental: latest invoice - 10 days (safety margin)
                    $startDate = Carbon::parse($latestDate)->subDays(10)->startOfDay();
                }

                $endDate = now()->endOfDay();

                // Check for duplicate pending requests for this range (roughly)
                // We avoid creating a new one if there's one with state != completed/failed
                $exists = SatRequest::where('rfc', $business->rfc)
                    ->where('type', $type)
                    ->whereIn('state', ['created', 'polling', 'downloading'])
                    ->exists();

                if (!$exists) {
                    SatRequest::create([
                        'id' => (string)\Illuminate\Support\Str::uuid(),
                        'rfc' => $business->rfc,
                        'type' => $type,
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                        'state' => 'created'
                    ]);
                    $requestCount++;
                }
            }

            $business->update([
                'is_syncing' => false,
                'last_sync_at' => now(),
                'sync_status' => 'queued'
            ]);

            // Optional: Verification
            if (!$business->last_verification_at || $business->last_verification_at < now()->subHours(24)) {
                $this->verifyInvoices($business);
            }

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
    public function verifyInvoices(Business $business)
    {
        // Limit to invoices not checked in last 24h and that are NOT canceled
        $query = Cfdi::where(function ($q) use ($business) {
            $q->where('rfc_emisor', $business->rfc)
                ->orWhere('rfc_receptor', $business->rfc);
        })
            ->where('es_cancelado', false)
            ->where(function ($q) {
            $q->whereNull('estado_sat_updated_at')
                ->orWhere('estado_sat_updated_at', '<', now()->subHours(24));
        });

        $totalToVerify = $query->count();
        $invoices = $query->limit(100)->get(); // Chunking to avoid timeout

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
                    'es_cancelado' => ($newStatus === 'Cancelado' ? 1 : 0)
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
}
