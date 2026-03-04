<?php

namespace App\Console\Commands;

use App\Models\Business;
use App\Models\BusinessNote;
use App\Models\SatRequest;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AnalyzeCoverageCommand extends Command
{
    protected $signature   = 'sat:analyze-coverage {--rfc= : Analizar solo este RFC} {--clear : Limpiar notas anteriores antes de analizar}';
    protected $description = 'Detecta clientes con problemas reales de descarga SAT y genera notas en Riesgos Fiscales';

    /**
     * Error patterns that require HUMAN intervention (grouped by action needed).
     * Key = note type, value = [label, action hint, keyword patterns]
     */
    private const CRITICAL_PATTERNS = [
        'wrong_passphrase' => [
            'title'    => 'Contraseña de llave privada incorrecta',
            'body_tpl' => 'La llave privada no puede abrirse con la contraseña registrada. Error: %s — Solución: actualizar la FIEL con la contraseña correcta desde el perfil del cliente.',
            'keywords' => ['bad decrypt', 'pkcs12 cipherfinal', 'bad password', 'cannot open private key'],
        ],
        'certificate_invalid' => [
            'title'    => 'Certificado SAT revocado, vencido o inválido',
            'body_tpl' => 'El SAT rechazó el certificado FIEL. Error: %s — Solución: renovar la e.firma ante el SAT y actualizar la FIEL del cliente.',
            'keywords' => ['certificado revocado', 'caduco', 'certificado inv', 'certificate revoked', 'revocado o caduco', 'certificado inválido', 'certificado invalido'],
        ],
        'duplicate_request' => [
            'title'    => 'Solicitud duplicada enviada al SAT (colisión de runners)',
            'body_tpl' => 'El SAT rechazó la solicitud porque llegaron dos peticiones idénticas casi simultáneamente (error de sincronización entre runners). Error: %s — El runner ya tiene un lock optimista para prevenir esto. Las solicitudes afectadas serán reencoladas.',
            'keywords' => ['solicitudes de por vida', 'agotado'],
        ],
        'server_error' => [
            'title'    => 'Error de servidor al procesar descarga',
            'body_tpl' => 'Fallo en el servidor al guardar o extraer el ZIP descargado del SAT. Error: %s — El administrador debe revisar los permisos de almacenamiento.',
            'keywords' => ['permission denied', 'failed to open stream', 'ziparchive', 'extractto'],
        ],
    ];

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
            $this->info("Notas previas eliminadas para {$rfcs->count()} cliente(s).");
        }

        $this->info("Analizando {$businesses->count()} cliente(s)...");
        $this->newLine();

        $stats = ['ok' => 0, 'issues' => 0, 'expired_fiel' => 0];

        foreach ($businesses as $business) {
            $issues = $this->analyzeBusiness($business);
            if ($issues > 0) {
                $stats['issues']++;
            } else {
                $stats['ok']++;
            }
        }

        $this->newLine();
        $this->info("Análisis completado: {$stats['ok']} sin problemas, {$stats['issues']} con problemas detectados.");
        $this->info("Las notas están disponibles en Riesgos Fiscales de cada cliente.");
        return 0;
    }

    private function analyzeBusiness(Business $business): int
    {
        $rfc    = $business->rfc;
        $name   = $business->common_name ?: $business->legal_name;
        $issues = 0;

        // ── 1. FIEL expirada ────────────────────────────────────────────
        if ($business->valid_until && $business->valid_until->isPast()) {
            $expiredSince = $business->valid_until->format('d/M/Y');
            $this->createNote($rfc, 'expired_fiel', null,
                'FIEL / e.firma vencida',
                "El certificado FIEL venció el {$expiredSince}. No se pueden realizar nuevas descargas del SAT hasta renovarlo con el SAT y actualizar la FIEL del cliente."
            );
            $this->warn("   ⚠  {$rfc} ({$name}): FIEL vencida desde {$expiredSince}");
            $issues++;
        }

        // ── 2. Analizar errores de solicitudes fallidas ──────────────────
        $failedRequests = SatRequest::where('rfc', $rfc)
            ->where('state', 'failed')
            ->whereNotNull('last_error')
            ->orderBy('updated_at', 'desc')
            ->get();

        if ($failedRequests->isEmpty()) {
            // No failures — check that at least one completed request exists
            $hasCompleted = SatRequest::where('rfc', $rfc)->where('state', 'completed')->exists();
            $hasAny       = SatRequest::where('rfc', $rfc)->exists();

            if (!$hasAny) {
                $this->createNote($rfc, 'info', null,
                    'Cliente pendiente de primera sincronización',
                    "No se ha iniciado ninguna solicitud SAT para este cliente. Se sincronizará automáticamente en el próximo ciclo del runner."
                );
                $this->line("   ℹ  {$rfc} ({$name}): pendiente primera sync");
                $issues++;
            } else {
                $this->info("   ✓  {$rfc} ({$name}): sin errores");
            }
            return $issues;
        }

        // Classify each failed request by its error message
        $detectedTypes = [];

        foreach ($failedRequests as $req) {
            $err = strtolower($req->last_error ?? '');
            foreach (self::CRITICAL_PATTERNS as $type => $config) {
                if (in_array($type, $detectedTypes)) continue; // already noted

                foreach ($config['keywords'] as $kw) {
                    if (str_contains($err, strtolower($kw))) {
                        $sample  = rtrim(substr($req->last_error, 0, 300));
                        $body    = sprintf($config['body_tpl'], $sample);
                        $typeStr = $req->type === 'issued' ? 'Emitidas' : 'Recibidas';

                        $this->createNote($rfc, $type, null,
                            $config['title'],
                            $body
                        );

                        $detectedTypes[] = $type;
                        $this->error("   ✗  {$rfc} ({$name}): {$config['title']}");
                        $issues++;
                        break;
                    }
                }
            }
        }

        // If failed requests exist but no critical pattern matched → transient SAT error (runner retries)
        if (empty($detectedTypes)) {
            $recentError    = $failedRequests->first()->last_error;
            $maxAttempts    = $failedRequests->max('attempts');
            $this->line("   ~  {$rfc} ({$name}): error transitorio SAT (runner reintenta) — " . substr($recentError, 0, 80));

            // Only create a note if attempts are exhausted (>= 5) with no recent completed requests
            $hasRecentCompleted = SatRequest::where('rfc', $rfc)
                ->where('state', 'completed')
                ->where('updated_at', '>=', now()->subDays(7))
                ->exists();

            if ($maxAttempts >= 5 && !$hasRecentCompleted) {
                $this->createNote($rfc, 'sat_error', null,
                    'Solicitudes SAT agotaron reintentos',
                    "Una o más solicitudes fallaron {$maxAttempts} veces con error del SAT: \"{$recentError}\". " .
                    "El SAT puede estar rechazando rangos de fechas muy grandes. El sistema creará nuevas solicitudes en el próximo ciclo."
                );
                $this->warn("   △  {$rfc} ({$name}): intentos agotados, se reencolarán");
                $issues++;
            }
        }

        return $issues;
    }

    private function createNote(string $rfc, string $type, ?string $invoiceType, string $title, string $body): void
    {
        // Avoid duplicates: skip if identical unresolved note exists
        $exists = BusinessNote::where('rfc', $rfc)
            ->where('type', $type)
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
