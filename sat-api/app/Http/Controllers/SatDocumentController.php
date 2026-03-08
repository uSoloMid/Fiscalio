<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SatDocument;
use App\Services\WhatsAppService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;

class SatDocumentController extends Controller
{
    /**
     * List documents for a given RFC (authenticated).
     */
    public function index(Request $request)
    {
        $rfc = $request->query('rfc');
        if (!$rfc) {
            return response()->json(['error' => 'RFC required'], 400);
        }

        $docs = SatDocument::where('rfc', strtoupper($rfc))
            ->orderBy('requested_at', 'desc')
            ->get()
            ->map(fn($d) => [
                'id'             => $d->id,
                'type'           => $d->type,
                'file_size'      => $d->file_size,
                'opinion_result' => $d->opinion_result,
                'requested_at'   => $d->requested_at?->toISOString(),
            ]);

        return response()->json($docs);
    }

    /**
     * Return businesses missing CSF/Opinion32D and those with a NEGATIVE latest opinion.
     */
    public function missing()
    {
        $allRfcs = DB::table('businesses')
            ->select('rfc', 'legal_name', 'common_name')
            ->orderBy('legal_name')
            ->get();

        $hasCsf     = DB::table('sat_documents')->where('type', 'csf')->distinct()->pluck('rfc')->flip();
        $hasOpinion = DB::table('sat_documents')->where('type', 'opinion_32d')->distinct()->pluck('rfc')->flip();

        $missingCsf     = $allRfcs->filter(fn($b) => !isset($hasCsf[$b->rfc]))->values();
        $missingOpinion = $allRfcs->filter(fn($b) => !isset($hasOpinion[$b->rfc]))->values();

        // Businesses whose latest opinion_32d is NEGATIVE
        $negativeOpinions = DB::table('sat_documents as d1')
            ->join('businesses', 'd1.rfc', '=', 'businesses.rfc')
            ->where('d1.type', 'opinion_32d')
            ->where('d1.opinion_result', 'negative')
            ->whereNotExists(function ($q) {
                $q->from('sat_documents as d2')
                    ->whereColumn('d2.rfc', 'd1.rfc')
                    ->where('d2.type', 'opinion_32d')
                    ->whereColumn('d2.requested_at', '>', 'd1.requested_at');
            })
            ->select('d1.rfc', 'businesses.legal_name', 'businesses.common_name', 'd1.requested_at')
            ->get()
            ->map(fn($b) => [
                'rfc'          => $b->rfc,
                'name'         => $b->common_name ?: $b->legal_name,
                'requested_at' => $b->requested_at,
            ]);

        return response()->json([
            'missing_csf'       => $missingCsf->map(fn($b) => ['rfc' => $b->rfc, 'name' => $b->common_name ?: $b->legal_name]),
            'missing_opinion'   => $missingOpinion->map(fn($b) => ['rfc' => $b->rfc, 'name' => $b->common_name ?: $b->legal_name]),
            'negative_opinions' => $negativeOpinions->values(),
        ]);
    }

    /**
     * Serve the PDF for download or inline view.
     * ?inline=1 → Content-Disposition: inline (browser preview)
     */
    public function download(Request $request, $id)
    {
        $doc = SatDocument::findOrFail($id);

        if (!Storage::exists($doc->file_path)) {
            return response()->json(['error' => 'Archivo no encontrado'], 404);
        }

        $filename = $doc->type === 'csf'
            ? 'Constancia_Situacion_Fiscal_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf'
            : 'Opinion_Cumplimiento_32D_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf';

        $inline = $request->boolean('inline', false);
        $headers = ['Content-Type' => 'application/pdf'];

        if ($inline) {
            $content = Storage::get($doc->file_path);
            return response($content, 200, array_merge($headers, [
                'Content-Disposition' => 'inline; filename="' . $filename . '"',
            ]));
        }

        return Storage::download($doc->file_path, $filename, $headers);
    }

    /**
     * Receive a PDF from the agent (no auth — internal only).
     */
    public function uploadFromAgent(Request $request)
    {
        $rfc  = strtoupper($request->input('rfc', ''));
        $type = $request->input('type', ''); // csf | opinion_32d

        if (!$rfc || !in_array($type, ['csf', 'opinion_32d'])) {
            return response()->json(['error' => 'rfc and type required'], 400);
        }

        if (!$request->hasFile('pdf')) {
            return response()->json(['error' => 'pdf file required'], 400);
        }

        $file      = $request->file('pdf');
        $timestamp = now()->format('Y-m-d_H-i');
        $dir       = "sat_docs/{$rfc}";
        $filename  = "{$type}_{$timestamp}.pdf";
        $path      = $file->storeAs($dir, $filename);

        $opinionResult = null;
        if ($type === 'opinion_32d') {
            $opinionResult = $this->parseOpinionResult($path);
        }

        $doc = SatDocument::create([
            'rfc'            => $rfc,
            'type'           => $type,
            'file_path'      => $path,
            'file_size'      => $file->getSize(),
            'opinion_result' => $opinionResult,
            'requested_at'   => now(),
        ]);

        // Deliver to pending WhatsApp requests
        $this->dispatchWhatsAppPending($doc);

        return response()->json(['success' => true, 'path' => $path, 'opinion_result' => $opinionResult]);
    }

    /**
     * Parse opinion result from the raw PDF binary.
     * SAT opinion PDFs are text-based; "POSITIVO"/"NEGATIVO" appear as readable text.
     */
    private function parseOpinionResult(string $filePath): ?string
    {
        try {
            $content = Storage::get($filePath);
            if (!$content) return null;

            // Extract readable text segments from the PDF binary
            $upper = strtoupper($content);

            // Look for the key words (they appear as plain text in SAT PDFs)
            if (strpos($upper, 'POSITIVO') !== false) return 'positive';
            if (strpos($upper, 'NEGATIVO') !== false) return 'negative';

            return null;
        } catch (\Exception $e) {
            Log::warning('Could not parse opinion result', ['path' => $filePath, 'error' => $e->getMessage()]);
            return null;
        }
    }

    private function dispatchWhatsAppPending(SatDocument $doc): void
    {
        $pending = DB::table('whatsapp_pending_requests')
            ->where('rfc', $doc->rfc)
            ->where('type', $doc->type)
            ->whereNull('sent_at')
            ->get();

        if ($pending->isEmpty()) {
            return;
        }

        $whatsapp = app(WhatsAppService::class);
        $date     = Carbon::parse($doc->requested_at)->format('d/m/Y');
        $label    = $doc->type === 'csf' ? 'Constancia de Situación Fiscal' : 'Opinión de Cumplimiento 32-D';
        $filename = $doc->type === 'csf'
            ? "CSF_{$doc->rfc}_{$date}.pdf"
            : "Opinion32D_{$doc->rfc}_{$date}.pdf";

        foreach ($pending as $req) {
            try {
                $ok = $whatsapp->sendPdf(
                    $req->phone,
                    $doc->file_path,
                    $filename,
                    "{$label} — {$doc->rfc} ({$date})"
                );

                if ($ok) {
                    DB::table('whatsapp_pending_requests')
                        ->where('id', $req->id)
                        ->update(['sent_at' => now()]);
                }
            } catch (\Exception $e) {
                Log::error('WhatsApp dispatch failed', ['id' => $req->id, 'error' => $e->getMessage()]);
            }
        }
    }
}
