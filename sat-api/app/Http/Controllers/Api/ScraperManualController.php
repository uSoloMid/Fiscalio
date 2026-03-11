<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\ScraperManualRequest;
use App\Models\Business;
use Illuminate\Support\Facades\Artisan;

class ScraperManualController extends Controller
{
    public function index()
    {
        $requests = ScraperManualRequest::with('business')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($requests);
    }

    public function stats()
    {
        $stats = [
            'pending' => ScraperManualRequest::where('status', 'pending')->count(),
            'processing' => ScraperManualRequest::where('status', 'processing')->count(),
            'completed' => ScraperManualRequest::where('status', 'completed')->count(),
            'failed' => ScraperManualRequest::where('status', 'failed')->count(),
        ];

        return response()->json($stats);
    }

    public function bulkQueue()
    {
        Artisan::call('scraper:manual-bulk');
        return response()->json(['message' => 'Bulk queueing initiated.']);
    }

    public function resetQueue()
    {
        ScraperManualRequest::where('status', 'failed')->update(['status' => 'pending']);
        return response()->json(['message' => 'Failed requests reset to pending.']);
    }
}
