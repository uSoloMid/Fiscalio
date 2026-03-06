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
    // Main message router
    // ─────────────────────────────────────────────
    private function handleMessage(string $from, string $body): void
    {
        // ── 1. Check if there's an active conversation step to continue
        $conv = $this->getConversation($from);
        if ($conv) {
            $this->continueConversation($from, $body, $conv);
            return;
        }

        // ── 2. Numeric reply → pending client selection (CSF/Opinion)
        if (preg_match('/^\d+$/', $body)) {
            $this->handleSelection($from, (int) $body);
            return;
        }

        // ── 3. FACTURAS keyword → invoice query flow
        if (preg_match('/^FACTURAS?\s*(.*)?$/iu', $body, $m)) {
            $rest = trim($m[1] ?? '');
            $this->startInvoiceFlow($from, $rest);
            return;
        }

        // ── 4. CSF/OPINION + RFC
        if (preg_match('/\b(CSF|OPINION|CUMPLIMIENTO|32D)\b.*?([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $type = in_array(strtoupper($m[1]), ['OPINION', 'CUMPLIMIENTO', '32D']) ? 'opinion_32d' : 'csf';
            $this->processDocumentRequest($from, strtoupper($m[2]), $type);
            return;
        }

        // ── 5. Bare RFC
        if (preg_match('/\b([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})\b/iu', $body, $m)) {
            $this->processDocumentRequest($from, strtoupper($m[1]), 'csf');
            return;
        }

        // ── 6. CSF/OPINION + name
        if (preg_match('/^(CSF|OPINION|CUMPLIMIENTO|32D)\s+(.+)$/iu', $body, $m)) {
            $type = in_array(strtoupper($m[1]), ['OPINION', 'CUMPLIMIENTO', '32D']) ? 'opinion_32d' : 'csf';
            $this->searchByName($from, trim($m[2]), $type);
            return;
        }

        // ── 7. Any text ≥ 3 chars → search by name for CSF
        if (strlen($body) >= 3) {
            $this->searchByName($from, $body, 'csf');
            return;
        }

        $this->sendHelp($from);
    }

    // ═════════════════════════════════════════════
    // INVOICE FLOW
    // ═════════════════════════════════════════════

    private function startInvoiceFlow(string $from, string $rest): void
    {
        // "FACTURAS RFC" → skip to direction step
        if (preg_match('/([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/iu', $rest, $m)) {
            $rfc = strtoupper($m[1]);
            $biz = DB::table('businesses')->where('rfc', $rfc)->first();
            $name = $biz ? ($biz->common_name ?: $biz->legal_name) : $rfc;
            $this->saveConversation($from, 'awaiting_direction', ['rfc' => $rfc, 'name' => $name]);
            $this->whatsapp->sendText($from, "*{$name}* ({$rfc})\n\n¿Emitidas o recibidas?\nE - Emitidas  |  R - Recibidas  |  T - Todas");
            return;
        }

        // "FACTURAS nombre" → search client first
        if (!empty($rest)) {
            $this->searchByNameForInvoices($from, $rest);
            return;
        }

        // "FACTURAS" alone → ask for client
        $this->whatsapp->sendText($from, "¿De que cliente? Envia el nombre o RFC:");
        $this->saveConversation($from, 'awaiting_client_invoices', []);
    }

    private function searchByNameForInvoices(string $from, string $name): void
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
            $this->whatsapp->sendText($from, "No encontre ningun cliente con *{$name}*. Intenta con otro nombre o RFC.");
            return;
        }

        if ($results->count() === 1) {
            $biz  = $results->first();
            $rfc  = $biz->rfc;
            $dname = $biz->common_name ?: $biz->legal_name;
            $this->saveConversation($from, 'awaiting_direction', ['rfc' => $rfc, 'name' => $dname]);
            $this->whatsapp->sendText($from, "*{$dname}* ({$rfc})\n\n¿Emitidas o recibidas?\nE - Emitidas  |  R - Recibidas  |  T - Todas");
            return;
        }

        // Multiple → store options in selections with invoice context
        $options = $results->map(fn($b) => [
            'rfc'  => $b->rfc,
            'name' => $b->common_name ?: $b->legal_name,
        ])->values()->toArray();

        DB::table('whatsapp_selections')->where('phone', $from)->delete();
        DB::table('whatsapp_selections')->insert([
            'phone'      => $from,
            'type'       => 'invoices',
            'options'    => json_encode($options),
            'expires_at' => now()->addMinutes(5),
        ]);

        $list = collect($options)->map(fn($o, $i) => ($i + 1) . ". {$o['name']} ({$o['rfc']})")->implode("\n");
        $this->whatsapp->sendText($from, "Varios clientes para *{$name}*:\n\n{$list}\n\nResponde con el numero:");
    }

    private function continueConversation(string $from, string $body, object $conv): void
    {
        $data = json_decode($conv->data, true);

        switch ($conv->step) {
            case 'awaiting_client_invoices':
                $this->clearConversation($from);
                $this->searchByNameForInvoices($from, $body);
                break;

            case 'awaiting_direction':
                $dir = strtoupper(trim($body));
                if (!in_array($dir, ['E', 'R', 'T'])) {
                    $this->whatsapp->sendText($from, "Responde E (Emitidas), R (Recibidas) o T (Todas):");
                    return;
                }
                $data['direction'] = $dir;
                $this->saveConversation($from, 'awaiting_period', $data);
                $this->whatsapp->sendText($from, "¿De que periodo?\nEj: *enero*, *2026-01*, *este mes*, *2025*");
                break;

            case 'awaiting_period':
                $period = $this->parsePeriod($body);
                if (!$period) {
                    $this->whatsapp->sendText($from, "No entendi el periodo. Intenta: *enero*, *2026-01*, *este mes* o *2025*");
                    return;
                }
                $data['period'] = $period;
                $this->clearConversation($from);
                $this->sendInvoiceSummary($from, $data);
                break;

            case 'awaiting_detail':
                $this->clearConversation($from);
                if (strtoupper(trim($body)) === '*' || strtoupper(trim($body)) === 'SI' || strtoupper(trim($body)) === 'S') {
                    $this->sendInvoiceList($from, $data, 0);
                } elseif (preg_match('/^MAS$/iu', trim($body))) {
                    $offset = ($data['offset'] ?? 0) + 10;
                    $this->sendInvoiceList($from, $data, $offset);
                } else {
                    // Filter by provider/client name
                    $data['filter'] = trim($body);
                    $this->sendInvoiceList($from, $data, 0);
                }
                break;
        }
    }

    private function sendInvoiceSummary(string $from, array $data): void
    {
        $rfc       = $data['rfc'];
        $direction = $data['direction'];
        $period    = $data['period'];  // ['type'=>'month'|'year', 'year'=>2026, 'month'=>1]

        $query = $this->buildCfdiQuery($rfc, $direction, $period);

        $count = (clone $query)->count();
        $total = (clone $query)->where('es_cancelado', 0)->sum('total');

        if ($count === 0) {
            $this->whatsapp->sendText($from, "No hay facturas para *{$data['name']}* en el periodo indicado.");
            return;
        }

        $dirLabel  = $direction === 'E' ? 'Emitidas' : ($direction === 'R' ? 'Recibidas' : 'Emitidas+Recibidas');
        $perLabel  = $this->periodLabel($period);
        $totalFmt  = '$' . number_format($total, 2);

        $msg = "*{$data['name']}* ({$rfc})\n"
             . "{$dirLabel} — {$perLabel}\n\n"
             . "Facturas: *{$count}*\n"
             . "Total: *{$totalFmt}* MXN\n\n"
             . "¿Ver detalle? Envia * para las ultimas 10\n"
             . "o escribe nombre para filtrar por proveedor/cliente:";

        $data['offset'] = 0;
        $this->saveConversation($from, 'awaiting_detail', $data);
        $this->whatsapp->sendText($from, $msg);
    }

    private function sendInvoiceList(string $from, array $data, int $offset): void
    {
        $query = $this->buildCfdiQuery($data['rfc'], $data['direction'], $data['period']);

        if (!empty($data['filter'])) {
            $f = $data['filter'];
            $query->where(function ($q) use ($f) {
                $q->where('name_emisor', 'like', "%{$f}%")
                  ->orWhere('name_receptor', 'like', "%{$f}%")
                  ->orWhere('rfc_emisor', 'like', "%{$f}%")
                  ->orWhere('rfc_receptor', 'like', "%{$f}%");
            });
        }

        $total = $query->count();
        $rows  = (clone $query)->orderBy('fecha', 'desc')->offset($offset)->limit(10)->get();

        if ($rows->isEmpty()) {
            $this->whatsapp->sendText($from, "No hay facturas con ese filtro.");
            return;
        }

        $lines = $rows->map(function ($r) use ($data) {
            $date      = Carbon::parse($r->fecha)->format('d/m');
            $amount    = '$' . number_format($r->total, 0);
            $cancelado = $r->es_cancelado ? ' CANC' : '';
            $folio     = ($r->serie ?? '') . ($r->folio ?? '');
            $folioStr  = $folio ? " [{$folio}]" : '';
            $counterpart = $data['direction'] === 'E'
                ? ($r->name_receptor ?: $r->rfc_receptor)
                : ($r->name_emisor   ?: $r->rfc_emisor);
            $counterpart = mb_substr($counterpart, 0, 22);
            return "• {$date}{$folioStr} {$counterpart} {$amount}{$cancelado}";
        })->implode("\n");

        $showing = $offset + $rows->count();
        $msg     = "Mostrando {$showing}/{$total}:\n\n{$lines}";

        if ($showing < $total) {
            $data['offset'] = $offset;
            $this->saveConversation($from, 'awaiting_detail', $data);
            $msg .= "\n\nEnvia *MAS* para ver las siguientes.";
        }

        $this->whatsapp->sendText($from, $msg);
    }

    // ─────────────────────────────────────────────
    // Helpers — CFDI query builder
    // ─────────────────────────────────────────────
    private function buildCfdiQuery(string $rfc, string $direction, array $period)
    {
        $query = DB::table('cfdis');

        if ($direction === 'E') {
            $query->where('rfc_emisor', $rfc);
        } elseif ($direction === 'R') {
            $query->where('rfc_receptor', $rfc);
        } else {
            $query->where(fn($q) => $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc));
        }

        if ($period['type'] === 'month') {
            $start = Carbon::create($period['year'], $period['month'], 1)->startOfMonth();
            $end   = $start->copy()->endOfMonth();
            $query->whereBetween('fecha', [$start, $end]);
        } else {
            $start = Carbon::create($period['year'], 1, 1)->startOfYear();
            $end   = $start->copy()->endOfYear();
            $query->whereBetween('fecha', [$start, $end]);
        }

        return $query;
    }

    private function parsePeriod(string $input): ?array
    {
        $input = strtolower(trim($input));
        $now   = Carbon::now();

        $months = ['enero'=>1,'febrero'=>2,'marzo'=>3,'abril'=>4,'mayo'=>5,'junio'=>6,
                   'julio'=>7,'agosto'=>8,'septiembre'=>9,'octubre'=>10,'noviembre'=>11,'diciembre'=>12];

        if ($input === 'este mes' || $input === 'mes') {
            return ['type' => 'month', 'year' => $now->year, 'month' => $now->month];
        }
        if ($input === 'mes pasado') {
            $last = $now->copy()->subMonth();
            return ['type' => 'month', 'year' => $last->year, 'month' => $last->month];
        }
        if (isset($months[$input])) {
            $month = $months[$input];
            $year  = $month > $now->month ? $now->year - 1 : $now->year;
            return ['type' => 'month', 'year' => $year, 'month' => $month];
        }
        // 2026-01
        if (preg_match('/^(\d{4})-(\d{2})$/', $input, $m)) {
            return ['type' => 'month', 'year' => (int)$m[1], 'month' => (int)$m[2]];
        }
        // 2025
        if (preg_match('/^(\d{4})$/', $input, $m)) {
            return ['type' => 'year', 'year' => (int)$m[1]];
        }
        return null;
    }

    private function periodLabel(array $period): string
    {
        if ($period['type'] === 'year') return (string)$period['year'];
        $months = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return $months[$period['month']] . ' ' . $period['year'];
    }

    // ─────────────────────────────────────────────
    // Conversation state helpers
    // ─────────────────────────────────────────────
    private function getConversation(string $from): ?object
    {
        return DB::table('whatsapp_conversations')
            ->where('phone', $from)
            ->where('expires_at', '>', now())
            ->first();
    }

    private function saveConversation(string $from, string $step, array $data): void
    {
        DB::table('whatsapp_conversations')->where('phone', $from)->delete();
        DB::table('whatsapp_conversations')->insert([
            'phone'      => $from,
            'step'       => $step,
            'data'       => json_encode($data),
            'expires_at' => now()->addMinutes(10),
        ]);
    }

    private function clearConversation(string $from): void
    {
        DB::table('whatsapp_conversations')->where('phone', $from)->delete();
    }

    // ═════════════════════════════════════════════
    // CSF / OPINION FLOW (existing)
    // ═════════════════════════════════════════════

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

        $options = $results->map(fn($b) => [
            'rfc'  => $b->rfc,
            'name' => $b->common_name ?: $b->legal_name,
        ])->values()->toArray();

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

    private function handleSelection(string $from, int $number): void
    {
        $selection = DB::table('whatsapp_selections')
            ->where('phone', $from)
            ->where('expires_at', '>', now())
            ->first();

        if (!$selection) {
            $this->whatsapp->sendText($from, "No hay ninguna seleccion pendiente. Envia el nombre o RFC del cliente.");
            return;
        }

        $options = json_decode($selection->options, true);

        if ($number < 1 || $number > count($options)) {
            $this->whatsapp->sendText($from, "Opcion invalida. Responde con un numero del 1 al " . count($options) . ".");
            return;
        }

        $chosen = $options[$number - 1];
        DB::table('whatsapp_selections')->where('phone', $from)->delete();

        if ($selection->type === 'invoices') {
            $this->saveConversation($from, 'awaiting_direction', ['rfc' => $chosen['rfc'], 'name' => $chosen['name']]);
            $this->whatsapp->sendText($from, "*{$chosen['name']}* ({$chosen['rfc']})\n\n¿Emitidas o recibidas?\nE - Emitidas  |  R - Recibidas  |  T - Todas");
        } else {
            $this->processDocumentRequest($from, $chosen['rfc'], $selection->type);
        }
    }

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

        $ok = $this->whatsapp->sendPdf($from, $doc->file_path, $filename, "{$label} — {$doc->rfc} ({$date})");

        if (!$ok) {
            $this->whatsapp->sendText($from, "Hubo un error al enviar el documento. Intenta de nuevo en unos minutos.");
        }
    }

    // ─────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────
    private function sendHelp(string $from): void
    {
        $this->whatsapp->sendText($from,
            "Hola! Comandos disponibles:\n\n" .
            "• *CSF Jose Salgado* — Constancia Fiscal\n" .
            "• *OPINION RFC* — Opinion 32-D\n" .
            "• *FACTURAS Jose* — Consultar facturas\n\n" .
            "Tambien puedes enviar solo el nombre o RFC del cliente."
        );
    }

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
