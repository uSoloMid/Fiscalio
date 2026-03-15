<?php

namespace App\Services;

use App\Models\BankMovement;
use App\Models\BankAccountMap;
use App\Models\Cfdi;
use App\Models\Poliza;
use App\Models\PolizaLine;
use App\Models\PolizaTemplate;
use App\Models\RfcAccountMap;
use Illuminate\Support\Facades\DB;

class PolizaGeneratorService
{
    /**
     * Genera una póliza a partir de un movimiento bancario + plantilla.
     * Lanza PolizaMissingAccountException si falta un mapeo RFC o banco.
     */
    public function generateFromMovement(BankMovement $movement, PolizaTemplate $template, int $numero): Poliza
    {
        // El CFDI principal vinculado (primer CFDI ligado al movimiento)
        $cfdi = $movement->cfdis->first() ?? $movement->cfdi;

        $businessId = $movement->statement->business_id;
        $businessRfc = $movement->statement->business->rfc;

        $fecha = $movement->date;
        $concepto = $this->buildConcepto($template->concepto_template, $movement, $cfdi);

        return DB::transaction(function () use (
            $movement, $template, $cfdi, $businessId, $businessRfc, $numero, $fecha, $concepto
        ) {
            $poliza = Poliza::create([
                'business_id'      => $businessId,
                'bank_movement_id' => $movement->id,
                'cfdi_id'          => $cfdi?->id,
                'template_id'      => $template->id,
                'tipo_poliza'      => $template->tipo_poliza,
                'numero'           => $numero,
                'fecha'            => $fecha,
                'concepto'         => $concepto,
                'status'           => 'draft',
            ]);

            foreach ($template->lines as $line) {
                $importe = $this->resolveImporte($line->importe_source, $movement, $cfdi);

                // Si la línea es opcional y el importe es 0, se omite
                if ($line->is_optional && abs($importe) < 0.001) {
                    continue;
                }

                $accountId = $this->resolveAccount(
                    $line->account_source,
                    $line->account_id,
                    $movement,
                    $cfdi,
                    $businessId,
                    $businessRfc
                );

                PolizaLine::create([
                    'poliza_id'  => $poliza->id,
                    'sort_order' => $line->sort_order,
                    'account_id' => $accountId,
                    'tipo_movto' => $line->tipo_movto,
                    'importe'    => round($importe, 2),
                    'concepto'   => $line->concepto_line,
                    'uuid_cfdi'  => $cfdi?->uuid,
                ]);
            }

            return $poliza->load('lines.account');
        });
    }

    /**
     * Genera una póliza a partir de un CFDI (ej. Provisión de Venta).
     */
    public function generateFromCfdi(Cfdi $cfdi, PolizaTemplate $template, int $numero, int $businessId, string $businessRfc): Poliza
    {
        $fecha = $cfdi->fecha ? \Carbon\Carbon::parse($cfdi->fecha)->toDateString() : now()->toDateString();
        $concepto = $this->buildConcepto($template->concepto_template, null, $cfdi);

        return DB::transaction(function () use (
            $cfdi, $template, $numero, $fecha, $concepto, $businessId, $businessRfc
        ) {
            $poliza = Poliza::create([
                'business_id'      => $businessId,
                'bank_movement_id' => null,
                'cfdi_id'          => $cfdi->id,
                'template_id'      => $template->id,
                'tipo_poliza'      => $template->tipo_poliza,
                'numero'           => $numero,
                'fecha'            => $fecha,
                'concepto'         => $concepto,
                'status'           => 'draft',
            ]);

            foreach ($template->lines as $line) {
                $importe = $this->resolveImporte($line->importe_source, null, $cfdi);

                if ($line->is_optional && abs($importe) < 0.001) {
                    continue;
                }

                $accountId = $this->resolveAccount(
                    $line->account_source,
                    $line->account_id,
                    null,
                    $cfdi,
                    $businessId,
                    $businessRfc
                );

                PolizaLine::create([
                    'poliza_id'  => $poliza->id,
                    'sort_order' => $line->sort_order,
                    'account_id' => $accountId,
                    'tipo_movto' => $line->tipo_movto,
                    'importe'    => round($importe, 2),
                    'concepto'   => $line->concepto_line,
                    'uuid_cfdi'  => $cfdi->uuid,
                ]);
            }

            return $poliza->load('lines.account');
        });
    }

    // ─── Resolución de importe ────────────────────────────────────────────────

    private function resolveImporte(string $source, ?BankMovement $movement, ?Cfdi $cfdi): float
    {
        return match ($source) {
            'cfdi_total'          => (float) ($cfdi?->total ?? 0),
            'cfdi_subtotal'       => (float) ($cfdi?->subtotal ?? 0),
            'cfdi_iva'            => (float) ($cfdi?->iva ?? 0),
            'cfdi_retencion_isr'  => (float) ($cfdi?->retenciones ?? 0),  // ISR retenido
            'cfdi_retencion_iva'  => $this->extractIvaRetencion($cfdi),
            'movement_amount'     => $movement
                                        ? max((float)$movement->cargo, (float)$movement->abono)
                                        : 0,
            default               => 0,
        };
    }

    private function extractIvaRetencion(?Cfdi $cfdi): float
    {
        if (!$cfdi) return 0;
        // El campo retenciones puede incluir ISR+IVA juntos; si hay campo específico usarlo
        // Por ahora retornamos 0 — se puede extender cuando se guarden por separado
        return 0;
    }

    // ─── Resolución de cuenta contable ───────────────────────────────────────

    private function resolveAccount(
        string $source,
        ?int $fixedAccountId,
        ?BankMovement $movement,
        ?Cfdi $cfdi,
        int $businessId,
        string $businessRfc
    ): int {
        return match ($source) {
            'fixed' => $fixedAccountId
                        ?? throw new \RuntimeException('Línea de plantilla con source=fixed pero sin account_id'),

            'rfc_cliente', 'rfc_proveedor' => $this->resolveRfcAccount(
                $source, $cfdi, $businessId, $businessRfc
            ),

            'banco' => $this->resolveBankAccount($movement, $businessId),

            default => throw new \RuntimeException("account_source desconocido: {$source}"),
        };
    }

    private function resolveRfcAccount(string $source, ?Cfdi $cfdi, int $businessId, string $businessRfc): int
    {
        if (!$cfdi) {
            throw new PolizaMissingAccountException('Sin CFDI para resolver cuenta por RFC', null, null);
        }

        // La "contraparte" depende de si somos emisor o receptor
        $counterpartRfc = ($cfdi->rfc_emisor === $businessRfc)
            ? $cfdi->rfc_receptor
            : $cfdi->rfc_emisor;

        $counterpartName = ($cfdi->rfc_emisor === $businessRfc)
            ? ($cfdi->name_receptor ?? $counterpartRfc)
            : ($cfdi->name_emisor ?? $counterpartRfc);

        $map = RfcAccountMap::where('business_id', $businessId)
            ->where('rfc', $counterpartRfc)
            ->first();

        if (!$map) {
            throw new PolizaMissingAccountException(
                "RFC sin cuenta contable asignada: {$counterpartRfc}",
                $counterpartRfc,
                $counterpartName
            );
        }

        return $map->account_id;
    }

    private function resolveBankAccount(?BankMovement $movement, int $businessId): int
    {
        if (!$movement) {
            throw new \RuntimeException('Sin movimiento bancario para resolver cuenta banco');
        }

        $statement = $movement->statement;

        // 1) Buscar por statement_id específico
        $map = BankAccountMap::where('business_id', $businessId)
            ->where('bank_statement_id', $statement->id)
            ->first();

        // 2) Si no, buscar por banco + últimos 4 dígitos de cuenta
        if (!$map && $statement->account_number) {
            $last4 = substr($statement->account_number, -4);
            $map = BankAccountMap::where('business_id', $businessId)
                ->where('bank_name', $statement->bank_name)
                ->where('account_number', $last4)
                ->first();
        }

        if (!$map) {
            throw new PolizaMissingAccountException(
                "Banco sin cuenta contable asignada: {$statement->bank_name} *{$statement->account_number}",
                null,
                null,
                'banco',
                $statement->bank_name,
                $statement->account_number
            );
        }

        return $map->account_id;
    }

    // ─── Concepto de póliza ───────────────────────────────────────────────────

    private function buildConcepto(?string $template, ?BankMovement $movement, ?Cfdi $cfdi): string
    {
        if (!$template) {
            // Concepto por defecto basado en datos disponibles
            if ($cfdi) {
                $name = $cfdi->name_emisor ?? $cfdi->name_receptor ?? $cfdi->rfc_emisor;
                return substr("CFDI {$name}", 0, 200);
            }
            if ($movement) {
                return substr($movement->description, 0, 200);
            }
            return 'Póliza generada por Fiscalio';
        }

        $rfc  = $cfdi?->rfc_emisor ?? $cfdi?->rfc_receptor ?? '';
        $name = $cfdi?->name_emisor ?? $cfdi?->name_receptor ?? '';
        $fecha = $movement?->date ?? $cfdi?->fecha ?? now()->toDateString();

        return substr(str_replace(
            ['{rfc}', '{nombre}', '{fecha}', '{descripcion}'],
            [$rfc,   $name,      $fecha,    $movement?->description ?? ''],
            $template
        ), 0, 200);
    }

    // ─── Siguiente número de póliza ───────────────────────────────────────────

    public function nextNumero(int $businessId, int $tipoPol, int $year): int
    {
        $max = Poliza::where('business_id', $businessId)
            ->where('tipo_poliza', $tipoPol)
            ->whereYear('fecha', $year)
            ->max('numero');
        return ($max ?? 0) + 1;
    }

    // ─── Detectar RFCs y bancos sin cuenta asignada (pre-check) ──────────────

    /**
     * Verifica qué RFCs y bancos necesitan cuenta antes de generar.
     * Retorna array con los que faltan para pedirlos al usuario primero.
     */
    public function checkMissingAccounts(array $items, int $businessId, string $businessRfc): array
    {
        $missingRfcs  = [];
        $missingBanks = [];

        foreach ($items as ['movement' => $movement, 'cfdi' => $cfdi, 'template' => $template]) {
            foreach ($template->lines as $line) {
                if (in_array($line->account_source, ['rfc_cliente', 'rfc_proveedor']) && $cfdi) {
                    $rfc = ($cfdi->rfc_emisor === $businessRfc) ? $cfdi->rfc_receptor : $cfdi->rfc_emisor;
                    $name = ($cfdi->rfc_emisor === $businessRfc)
                        ? ($cfdi->name_receptor ?? $rfc)
                        : ($cfdi->name_emisor ?? $rfc);

                    if (!RfcAccountMap::where('business_id', $businessId)->where('rfc', $rfc)->exists()) {
                        $missingRfcs[$rfc] = ['rfc' => $rfc, 'nombre' => $name];
                    }
                }

                if ($line->account_source === 'banco' && $movement) {
                    $statement = $movement->statement;
                    $key = $statement->bank_name . '_' . substr($statement->account_number ?? '', -4);
                    if (!isset($missingBanks[$key])) {
                        $hasMap = BankAccountMap::where('business_id', $businessId)
                            ->where(function ($q) use ($statement) {
                                $q->where('bank_statement_id', $statement->id)
                                  ->orWhere(function ($q2) use ($statement) {
                                      $q2->where('bank_name', $statement->bank_name)
                                         ->where('account_number', substr($statement->account_number ?? '', -4));
                                  });
                            })->exists();

                        if (!$hasMap) {
                            $missingBanks[$key] = [
                                'bank_name'      => $statement->bank_name,
                                'account_number' => $statement->account_number,
                                'statement_id'   => $statement->id,
                            ];
                        }
                    }
                }
            }
        }

        return [
            'missing_rfcs'  => array_values($missingRfcs),
            'missing_banks' => array_values($missingBanks),
        ];
    }
}
