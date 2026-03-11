<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Business;
use App\Models\ScraperManualRequest;
use Carbon\Carbon;

class ScraperManualBulk extends Command
{
    protected $signature = 'scraper:manual-bulk';
    protected $description = 'Queue manual scraper requests for all businesses (Feb - Mar 11)';

    public function handle()
    {
        $businesses = Business::all();
        $this->info("Queueing requests for " . $businesses->count() . " businesses.");

        foreach ($businesses as $business) {
            // RECIBIDAS FEBRERO
            ScraperManualRequest::updateOrCreate(
                ['rfc' => $business->rfc, 'type' => 'received', 'start_date' => '2026-02-01', 'end_date' => '2026-02-28'],
                ['status' => 'pending']
            );

            // RECIBIDAS MARZO (1-11)
            ScraperManualRequest::updateOrCreate(
                ['rfc' => $business->rfc, 'type' => 'received', 'start_date' => '2026-03-01', 'end_date' => '2026-03-11'],
                ['status' => 'pending']
            );

            // EMITIDAS FEBRERO - MARZO 11
            ScraperManualRequest::updateOrCreate(
                ['rfc' => $business->rfc, 'type' => 'issued', 'start_date' => '2026-02-01', 'end_date' => '2026-03-11'],
                ['status' => 'pending']
            );
        }

        $this->info("Bulk queueing completed.");
    }
}
