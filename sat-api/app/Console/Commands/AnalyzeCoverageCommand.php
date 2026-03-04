<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Models\BusinessNote;
use App\Models\SatRequest;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class AnalyzeCoverageCommand extends Command
{
    protected $signature   = 'sat:analyze-coverage {--rfc= : Analizar solo este RFC} {--clear : Limpiar notas anteriores antes de analizar}';
    protected $description = 'Analiza la cobertura de 5 años de cada cliente y genera notas de diagnóstico en Riesgos Fiscales';

    // Target: January 1st of 5 years ago
    private function expectedStart(): Carbon
    {
        return now()->subYears(5)->startOfYear();
    }

    public function handle(): int
    {
        $query = Business::query();

        if ($rfc = $this->option('rfc')) {
            $query->where('rfc', strtoupper($rfc));
        }

        $businesses = $query->get();

        if ($businesses->isEmpty()) {
            $this->warn('No se encontraron clientes.');
            return 0;
        }

        if ($this->option('clear')) {
            $rfcs = $businesses->pluck('rfc');
            BusinessNote::whereIn('rfc', $rfcs)->delete();
            $this->info("Notas previas eliminadas.");
        }

        $this->info("Analizando cobertura SAT de {$businesses->count()} cliente(s)...");
        $this->newLine();

        foreach ($businesses as $business) {
            $this->analyzeBusiness($business);
        }

        $this->newLine();
        $this->info('Análisis completado.');
        return 0;
    }

    private function analyzeBusiness(Business $business): void
    {
        $rfc     = $business->rfc;
        $name    = $business->common_name ?: $business->legal_name;
        $expected = $this->expectedStart();

        $this->line("── {$rfc}  ({$name})");

        // ── 1. FIEL expirada ──────────────────────────────────────────────
        if ($business->valid_until && $business->valid_until->isPast()) {
            $expiredSince = $business->valid_until->format('d/M/Y');
            $this->createNote($rfc, 'expired_fiel', null,
                'FIEL / e.firma vencida',
                "El certificado FIEL venció el {$expiredSince}. No se pueden realizar nuevas descargas del SAT hasta renovarlo."
            );
            $this->warn("   ⚠  FIEL vencida desde {$expiredSince}");
        }

        // ── 2. Errores de credenciales recientes ──────────────────────────
        $credentialKeywords = ['contraseña', 'passphrase', 'autenticaci', '401', 'credencial',
                               'certificate', 'certificado', 'private key', 'llave'];

        $credErrors = SatRequest::where('rfc', $rfc)
            ->where('state', 'failed')
            ->whereNotNull('last_error')
            ->get()
            ->filter(function ($req) use ($credentialKeywords) {
                $err = strtolower($req->last_error);
                foreach ($credentialKeywords as $kw) {
                    if (str_contains($err, strtolower($kw))) return true;
                }
                return false;
            });

        if ($credErrors->isNotEmpty()) {
            $sample = $credErrors->first()->last_error;
            $this->createNote($rfc, 'credential_error', null,
                'Posible error de credenciales (FIEL/CIEC)',
                "Se detectaron {$credErrors->count()} solicitud(es) fallida(s) con errores de autenticación. " .
                "Verificar que la contraseña de la llave privada y el certificado sean correctos.\n\nEjemplo: \"{$sample}\""
            );
            $this->warn("   ⚠  {$credErrors->count()} error(es) de credenciales detectados");
        }

        // ── 3. Cobertura por tipo ─────────────────────────────────────────
        foreach (['issued', 'received'] as $type) {
            $typeLabel = $type === 'issued' ? 'Emitidas' : 'Recibidas';

            // Find oldest COMPLETED request for this RFC + type
            $oldest = SatRequest::where('rfc', $rfc)
                ->where('type', $type)
                ->where('state', 'completed')
                ->orderBy('start_date', 'asc')
                ->first();

            if (!$oldest) {
                // Check if there are ANY requests (even failed)
                $anyRequest = SatRequest::where('rfc', $rfc)->where('type', $type)->exists();
                if (!$anyRequest) {
                    $this->createNote($rfc, 'coverage_gap', $type,
                        "Sin historial SAT: {$typeLabel}",
                        "No se ha encontrado ninguna solicitud SAT para facturas {$typeLabel}. " .
                        "El cliente no ha sido sincronizado aún o las solicitudes fueron eliminadas."
                    );
                    $this->error("   ✗  [{$typeLabel}] Sin solicitudes SAT registradas");
                } else {
                    $failedCount = SatRequest::where('rfc', $rfc)->where('type', $type)->where('state', 'failed')->count();
                    $this->createNote($rfc, 'sat_error', $type,
                        "Sin descargas completadas: {$typeLabel}",
                        "Existen {$failedCount} solicitud(es) fallida(s) para {$typeLabel} pero ninguna completada. " .
                        "La cobertura histórica no pudo establecerse."
                    );
                    $this->error("   ✗  [{$typeLabel}] {$failedCount} solicitud(es) fallidas, 0 completadas");
                }
                continue;
            }

            // Check coverage gap from expected start
            $oldestStart = Carbon::parse($oldest->start_date);
            $gapDays = $expected->diffInDays($oldestStart, false); // positive = oldest is AFTER expected

            if ($gapDays > 60) {
                $gapMonths = (int) ceil($gapDays / 30);
                $coveredFrom = $oldestStart->format('M Y');
                $expectedFrom = $expected->format('M Y');

                $reason = '';
                // Check if FIEL was expired during that gap period
                if ($business->valid_until && $business->valid_until < $oldestStart) {
                    $reason = " La FIEL venció el {$business->valid_until->format('d/M/Y')}, lo que pudo impedir descargas anteriores.";
                }

                $this->createNote($rfc, 'coverage_gap', $type,
                    "Brecha de cobertura SAT: {$typeLabel}",
                    "La cobertura de {$typeLabel} inicia en {$coveredFrom}, pero el objetivo son 5 años ({$expectedFrom}). " .
                    "Hay aproximadamente {$gapMonths} mes(es) sin datos SAT.{$reason}"
                );
                $this->warn("   △  [{$typeLabel}] Cubre desde {$coveredFrom} (falta ~{$gapMonths} mes(es) hasta {$expectedFrom})");
            } else {
                $coveredFrom = $oldestStart->format('M Y');
                $this->info("   ✓  [{$typeLabel}] Cobertura OK desde {$coveredFrom}");
            }

            // ── 4. Check for failed requests within the covered period ────
            $failedInRange = SatRequest::where('rfc', $rfc)
                ->where('type', $type)
                ->where('state', 'failed')
                ->where('start_date', '>=', $expected)
                ->count();

            if ($failedInRange > 0) {
                // Only create note if not already covered by credential error note
                if ($credErrors->isEmpty()) {
                    $this->createNote($rfc, 'sat_error', $type,
                        "Solicitudes fallidas en periodo cubierto: {$typeLabel}",
                        "Se encontraron {$failedInRange} solicitud(es) fallida(s) para {$typeLabel} dentro del periodo de 5 años. " .
                        "Puede haber brechas puntuales en los datos."
                    );
                }
                $this->warn("   △  [{$typeLabel}] {$failedInRange} solicitud(es) fallida(s) en el periodo");
            }
        }

        $this->newLine();
    }

    private function createNote(string $rfc, string $type, ?string $invoiceType, string $title, string $body): void
    {
        // Avoid duplicates: skip if identical note already exists
        $exists = BusinessNote::where('rfc', $rfc)
            ->where('type', $type)
            ->where('invoice_type', $invoiceType)
            ->where('title', $title)
            ->whereNull('resolved_at')
            ->exists();

        if (!$exists) {
            BusinessNote::create([
                'rfc'          => $rfc,
                'type'         => $type,
                'invoice_type' => $invoiceType,
                'title'        => $title,
                'body'         => $body,
            ]);
        }
    }
}
