<?php

namespace App\Http\Controllers;

use App\Models\Business;
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

        $entry   = $payload['entry'][0]    ?? null;
        $change  = $entry['changes'][0]    ?? null;
        $value   = $change['value']        ?? null;
        $message = $value['messages'][0]   ?? null;

        if (!$message || ($message['type'] ?? '') !== 'text') {
            return response()->json(['ok' => true]);
        }

        $from = $this->normalizePhone($message['from']);
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
        // ── 1. Numeric reply → pending selection
        if (preg_match('/^\d+$/', $body)) {
            $this->handleSelection($from, (int) $body);
            return;
        }

        // ── 2. Detect type keyword + RFC  (e.g. "CSF XAXX010101000")
        if (preg_match('/\b(CSF|OPINION|CUMPLIMIENTO|32D)\b.*?([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $type = in_array(strtoupper($m[1]), ['OPINION', 'CUMPLIMIENTO', '32D']) ? 'opinion_32d' : 'csf';
            $this->processDocumentRequest($from, strtoupper($m[2]), $type);
            return;
        }

        // ── 3. Bare RFC  (e.g. "XAXX010101000")
        if (preg_match('/\b([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $this->processDocumentRequest($from, strtoupper($m[1]), 'csf');
            return;
        }

        // ── 4. Type keyword + name  (e.g. "CSF Jose Salgado" or "OPINION Jose")
        if (preg_match('/^(CSF|OPINION|CUMPLIMIENTO|32D)\s+(.+)$/iu', $body, $m)) {
            $type = in_array(strtoupper($m[1]), ['OPINION', 'CUMPLIMIENTO', '32D']) ? 'opinion_32d' : 'csf';
            $this->searchByName($from, trim($m[2]), $type);
            return;
        }

        // ── 5. Just a name  (assume CSF)
        if (strlen($body) >= 3) {
            $this->searchByName($from, $body, 'csf');
            return;
        }

        // ── 6. Help
        $this->whatsapp->sendText($from,
            "Hola! Para solicitar documentos del SAT puedes enviar:\n\n" .
            "• *CSF TURF123456ABC* — por RFC\n" .
            "• *CSF Jose Salgado* — buscar por nombre\n" .
            "• *OPINION TURF123456ABC* — Opinion 32-D\n\n" .
            "Recibes el PDF en segundos si ya existe, o en minutos si hay que descargarlo."
        );
    }

    // ─────────────────────────────────────────────
    // Search by name
    // ─────────────────────────────────────────────
    private function searchByName(string $from, string $name, string $type): void
    {
        $results = DB::table('businesses')
            ->where(function ($q) use ($name) {
                $q->where('legal_name', 'like', "%{$name}%")
                  ->orWhere('common_name', 'like', "%{$name}%");
            })
            ->select('rfc', 'legal_name', 'common_name')
            ->orderBy('legal_name')
            ->limit(10)
            ->get();

        if ($results->isEmpty()) {
            $this->whatsapp->sendText($from, "No encontre ningun cliente con el nombre *{$name}*. Intenta con otro nombre o envia el RFC directamente.");
            return;
        }

        if ($results->count() === 1) {
            $this->processDocumentRequest($from, $results->first()->rfc, $type);
            return;
        }

        // Multiple results — store selection and ask user
        $options = $results->map(fn($b) => [
            'rfc'  => $b->rfc,
            'name' => $b->common_name ?: $b->legal_name,
        ])->values()->toArray();

        // Clear any previous selection for this phone
        DB::table('whatsapp_selections')->where('phone', $from)->delete();
        DB::table('whatsapp_selections')->insert([
            'phone'      => $from,
            'type'       => $type,
            'options'    => json_encode($options),
            'expires_at' => now()->addMinutes(5),
        ]);

        $label = $type === 'csf' ? 'CSF' : 'Opinion 32-D';
        $list  = collect($options)->map(fn($o, $i) => ($i + 1) . ". {$o['name']} ({$o['rfc']})")->implode("\n");
        $this->whatsapp->sendText($from, "Encontre varios clientes para *{$name}*:\n\n{$list}\n\nResponde con el *numero* del que quieres la {$label}:");
    }

    // ─────────────────────────────────────────────
    // Handle numeric selection
    // ─────────────────────────────────────────────
    private function handleSelection(string $from, int $number): void
    {
        $selection = DB::table('whatsapp_selections')
            ->where('phone', $from)
            ->where('expires_at', '>', now())
            ->first();

        if (!$selection) {
            // No pending selection — maybe it's something else, show help
            $this->whatsapp->sendText($from, "No hay ninguna seleccion pendiente. Envia el nombre o RFC del cliente.");
            return;
        }

        $options = json_decode($selection->options, true);

        if ($number < 1 || $number > count($options)) {
            $max = count($options);
            $this->whatsapp->sendText($from, "Opcion invalida. Responde con un numero del 1 al {$max}.");
            return;
        }

        $chosen = $options[$number - 1];

        // Clear the selection
        DB::table('whatsapp_selections')->where('phone', $from)->delete();

        $this->processDocumentRequest($from, $chosen['rfc'], $selection->type);
    }

    // ─────────────────────────────────────────────
    // Process document request for a known RFC
    // ─────────────────────────────────────────────
    private function processDocumentRequest(string $from, string $rfc, string $type): void
    {
        $doc = SatDocument::where('rfc', $rfc)
            ->where('type', $type)
            ->orderBy('requested_at', 'desc')
            ->first();

        if ($doc) {
            $this->sendDocumentToUser($from, $doc);
            return;
        }

        DB::table('whatsapp_pending_requests')->insert([
            'phone'        => $from,
            'rfc'          => $rfc,
            'type'         => $type,
            'requested_at' => now(),
        ]);

        $this->triggerScraper($rfc);

        $label = $type === 'csf' ? 'Constancia de Situacion Fiscal' : 'Opinion de Cumplimiento 32-D';
        $this->whatsapp->sendText($from,
            "Solicitud recibida para *{$rfc}* ({$label}).\n" .
            "Estoy descargando el documento del SAT, te lo envio en cuanto este listo (normalmente menos de 2 minutos)."
        );
    }

    private function sendDocumentToUser(string $from, SatDocument $doc): void
    {
        $label    = $doc->type === 'csf' ? 'Constancia de Situacion Fiscal' : 'Opinion de Cumplimiento 32-D';
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

    /**
     * Normalize Mexican mobile numbers: 521XXXXXXXXXX → 52XXXXXXXXXX
     */
    private function normalizePhone(string $phone): string
    {
        if (preg_match('/^521(\d{10})$/', $phone, $m)) {
            return '52' . $m[1];
        }
        return $phone;
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
