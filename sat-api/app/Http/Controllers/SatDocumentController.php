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
                'id'           => $d->id,
                'type'         => $d->type,
                'file_size'    => $d->file_size,
                'requested_at' => $d->requested_at?->toISOString(),
            ]);

        return response()->json($docs);
    }

    /**
     * Serve the PDF file for download (authenticated).
     */
    public function download($id)
    {
        $doc = SatDocument::findOrFail($id);

        if (!Storage::exists($doc->file_path)) {
            return response()->json(['error' => 'Archivo no encontrado'], 404);
        }

        $filename = $doc->type === 'csf'
            ? 'Constancia_Situacion_Fiscal_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf'
            : 'Opinion_Cumplimiento_32D_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf';

        return Storage::download($doc->file_path, $filename, [
            'Content-Type' => 'application/pdf',
        ]);
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

        $doc = SatDocument::create([
            'rfc'          => $rfc,
            'type'         => $type,
            'file_path'    => $path,
            'file_size'    => $file->getSize(),
            'requested_at' => now(),
        ]);

        // Deliver to pending WhatsApp requests
        $this->dispatchWhatsAppPending($doc);

        return response()->json(['success' => true, 'path' => $path]);
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
