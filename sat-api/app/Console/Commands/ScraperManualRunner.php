<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\ScraperManualRequest;
use App\Models\Business;
use App\Services\XmlProcessorService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\File;
use Carbon\Carbon;

class ScraperManualRunner extends Command
{
    protected $signature = 'scraper:manual-run {--step=all}';
    protected $description = 'Process the manual scraper queue';

    public function handle(XmlProcessorService $xmlProcessor)
    {
        $step = $this->option('step');
        $request = ScraperManualRequest::where('status', $step === 'import' ? 'processing' : 'pending')
            ->orderBy('created_at', 'asc')
            ->first();

        if (!$request) return;

        $business = Business::where('rfc', $request->rfc)->first();
        if (!$business) return;

        if ($step === 'prepare' || $step === 'all') {
            $request->update(['status' => 'processing']);
            $rfc = $business->rfc;
            $agentFielDir = "/var/www/agent_folder/fiel/$rfc";
            if (!File::exists($agentFielDir)) File::makeDirectory($agentFielDir, 0777, true);
            File::put("$agentFielDir/$rfc.cer", base64_decode($business->certificate));
            File::put("$agentFielDir/$rfc.key", base64_decode($business->private_key));
            
            // Output for host runner
            $this->line("READY|{$business->rfc}|{$business->passphrase}|{$request->type}|{$request->start_date}|{$request->end_date}");
        }

        if ($step === 'import' || $step === 'all') {
            $rfc = $business->rfc;
            $resultDir = "/var/www/agent_folder/downloads/$rfc";
            $xmlCount = $xmlProcessor->processScraperResult($resultDir, $rfc, "SCRAPER-" . $request->id);

            $request->update([
                'status' => 'completed',
                'xml_count' => $xmlCount,
                'error' => null
            ]);
            $this->info("Imported $xmlCount XMLs for $rfc");
        }
    }
}
