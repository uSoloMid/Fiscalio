<?php

namespace App\Http\Controllers;

use App\Models\SatDocument;
use App\Services\WhatsAppService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppController extends Controller
{
    public function __construct(private WhatsAppService $whatsapp) {}

    // ─────────────────────────────────────────────
    // Webhook verification (GET)
    // ─────────────────────────────────────────────
    public function verify(Request $request)
    {
        $verifyToken = config('services.whatsapp.verify_token', '');

        if (
            $request->query('hub_mode') === 'subscribe' &&
            $request->query('hub_verify_token') === $verifyToken
        ) {
            return response($request->query('hub_challenge'), 200);
        }

        return response('Forbidden', 403);
    }

    // ─────────────────────────────────────────────
    // Webhook events (POST)
    // ─────────────────────────────────────────────
    public function webhook(Request $request)
    {
        $payload = $request->json()->all();

        // Walk to the message object
        $entry   = $payload['entry'][0]         ?? null;
        $change  = $entry['changes'][0]          ?? null;
        $value   = $change['value']              ?? null;
        $message = $value['messages'][0]         ?? null;

        if (!$message || ($message['type'] ?? '') !== 'text') {
            return response()->json(['ok' => true]);
        }

        $from = $message['from'];                  // phone in E.164 without +
        $body = trim($message['text']['body'] ?? '');

        Log::info('WhatsApp message received', ['from' => $from, 'body' => $body]);

        $this->handleMessage($from, $body);

        return response()->json(['ok' => true]);
    }

    // ─────────────────────────────────────────────
    // Message logic
    // ─────────────────────────────────────────────
    private function handleMessage(string $from, string $body): void
    {
        // Detect command: CSF <RFC> or OPINION <RFC>
        if (preg_match('/\b(CSF|OPINION|CUMPLIMIENTO|32D)\b.*?([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $typeRaw = strtoupper($m[1]);
            $rfc     = strtoupper($m[2]);
            $type    = in_array($typeRaw, ['OPINION', 'CUMPLIMIENTO', '32D']) ? 'opinion_32d' : 'csf';
            $this->processDocumentRequest($from, $rfc, $type);
            return;
        }

        // Try to detect bare RFC
        if (preg_match('/\b([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $rfc = strtoupper($m[1]);
            $this->processDocumentRequest($from, $rfc, 'csf');
            return;
        }

        // Help / unknown
        $this->whatsapp->sendText($from,
            "Hola 👋 Para solicitar documentos del SAT envía:\n\n" .
            "• *CSF TURF123456ABC* — Constancia de Situación Fiscal\n" .
            "• *OPINION TURF123456ABC* — Opinión de Cumplimiento 32-D\n\n" .
            "Recibirás el PDF en segundos si ya fue descargado, o en minutos si está pendiente."
        );
    }

    private function processDocumentRequest(string $from, string $rfc, string $type): void
    {
        // Check if we have the document already
        $doc = SatDocument::where('rfc', $rfc)
            ->where('type', $type)
            ->orderBy('requested_at', 'desc')
            ->first();

        if ($doc) {
            $this->sendDocumentToUser($from, $doc);
            return;
        }

        // Queue the request
        DB::table('whatsapp_pending_requests')->insert([
            'phone'        => $from,
            'rfc'          => $rfc,
            'type'         => $type,
            'requested_at' => now(),
        ]);

        // Trigger the agent scraper
        $this->triggerScraper($rfc);

        $label = $type === 'csf' ? 'Constancia de Situación Fiscal' : 'Opinión de Cumplimiento 32-D';
        $this->whatsapp->sendText($from,
            "Solicitud recibida para *{$rfc}* ({$label}).\n" .
            "Estoy descargando el documento del SAT, te lo envío en cuanto esté listo (normalmente menos de 2 minutos)."
        );
    }

    private function sendDocumentToUser(string $from, SatDocument $doc): void
    {
        $label    = $doc->type === 'csf' ? 'Constancia de Situación Fiscal' : 'Opinión de Cumplimiento 32-D';
        $date     = Carbon::parse($doc->requested_at)->format('d/m/Y');
        $filename = $doc->type === 'csf'
            ? "CSF_{$doc->rfc}_{$date}.pdf"
            : "Opinion32D_{$doc->rfc}_{$date}.pdf";

        $ok = $this->whatsapp->sendPdf(
            $from,
            $doc->file_path,
            $filename,
            "{$label} — {$doc->rfc} ({$date})"
        );

        if (!$ok) {
            $this->whatsapp->sendText($from, "Hubo un error al enviar el documento. Intenta de nuevo en unos minutos.");
        }
    }

    private function triggerScraper(string $rfc): void
    {
        try {
            $agentUrl = config('services.agent.url', 'http://fiscalio-agent:3005');
            Http::timeout(5)->post("{$agentUrl}/run-scraper", ['rfc' => $rfc]);
        } catch (\Exception $e) {
            Log::warning('WhatsApp: failed to trigger scraper', ['rfc' => $rfc, 'error' => $e->getMessage()]);
        }
    }
}
