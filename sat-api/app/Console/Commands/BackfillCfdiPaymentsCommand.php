<?php

namespace App\Console\Commands;

use App\Models\Cfdi;
use App\Models\CfdiPayment;
use App\Services\XmlProcessorService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class BackfillCfdiPaymentsCommand extends Command
{
    protected $signature = 'cfdi:backfill-payments
                            {--rfc= : Limit to a specific RFC (emisor or receptor)}
                            {--dry-run : Show what would be inserted without saving}';

    protected $description = 'Backfill cfdi_payments for REP (tipo=P) CFDIs that have no payment records';

    public function handle(XmlProcessorService $processor): int
    {
        $rfc    = strtoupper($this->option('rfc') ?? '');
        $dryRun = $this->option('dry-run');

        $query = Cfdi::where('tipo', 'P')
            ->whereDoesntHave('pagosPropios');

        if ($rfc) {
            $query->where(function ($q) use ($rfc) {
                $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
            });
        }

        $total  = $query->count();
        $this->info("REPs sin pagos registrados: {$total}" . ($rfc ? " (RFC: {$rfc})" : ''));

        if ($total === 0) {
            $this->info('Nada que backfill-ear.');
            return 0;
        }

        if ($dryRun) {
            $this->warn('--dry-run activo: no se guardarán cambios.');
        }

        $inserted = 0;
        $skipped  = 0;
        $errors   = 0;

        $bar = $this->output->createProgressBar($total);
        $bar->start();

        $query->chunkById(200, function ($reps) use ($processor, $dryRun, &$inserted, &$skipped, &$errors, $bar) {
            foreach ($reps as $cfdi) {
                try {
                    $payments = $this->extractPayments($cfdi, $processor);

                    if (empty($payments)) {
                        $skipped++;
                        $bar->advance();
                        continue;
                    }

                    if (!$dryRun) {
                        foreach ($payments as $p) {
                            CfdiPayment::firstOrCreate(
                                [
                                    'uuid_pago'       => $cfdi->uuid,
                                    'uuid_relacionado' => $p['uuid_relacionado'],
                                    'num_parcialidad'  => $p['num_parcialidad'],
                                ],
                                [
                                    'fecha_pago'       => $p['fecha_pago'],
                                    'monto_pagado'     => $p['monto_pagado'],
                                    'saldo_anterior'   => $p['saldo_anterior'],
                                    'saldo_insoluto'   => $p['saldo_insoluto'],
                                    'moneda_pago'      => $p['moneda_pago'],
                                    'tipo_cambio_pago' => $p['tipo_cambio_pago'],
                                ]
                            );
                        }
                    }

                    $inserted += count($payments);
                } catch (\Throwable $e) {
                    $errors++;
                    $this->newLine();
                    $this->error("Error en {$cfdi->uuid}: " . $e->getMessage());
                }

                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine(2);

        $this->table(
            ['Métrica', 'Valor'],
            [
                ['REPs procesadas', $total],
                ['Pagos ' . ($dryRun ? 'detectados' : 'insertados'), $inserted],
                ['REPs sin nodo Pago (skip)', $skipped],
                ['Errores', $errors],
            ]
        );

        return 0;
    }

    /**
     * Try to extract payments from the stored XML file.
     * Falls back to xml_data JSON if the file is missing.
     */
    private function extractPayments(Cfdi $cfdi, XmlProcessorService $processor): array
    {
        // Prefer the actual XML file
        if ($cfdi->path_xml && Storage::exists($cfdi->path_xml)) {
            $content = Storage::get($cfdi->path_xml);
            $data    = $processor->parseCfdi($content);
            return $data['payments'] ?? [];
        }

        // Fallback: reconstruct from xml_data JSON (already parsed array)
        if (!empty($cfdi->xml_data)) {
            return $this->extractPaymentsFromXmlData($cfdi->xml_data, $cfdi->uuid);
        }

        return [];
    }

    /**
     * Parse payment nodes from the xml_data array structure
     * (stored by xmlToArray() in XmlProcessorService).
     */
    private function extractPaymentsFromXmlData(array $xmlData, string $uuidPago): array
    {
        $payments = [];

        // Navigate: cfdi:Comprobante > cfdi:Complemento > pago20:Pagos > pago20:Pago
        $comprobante = $xmlData['cfdi:Comprobante']
            ?? $xmlData[array_key_first($xmlData)]
            ?? null;

        if (!$comprobante) return [];

        $complemento = $comprobante['cfdi:Complemento'] ?? null;
        if (!$complemento) return [];

        // Pagos node may appear under different namespace prefixes
        $pagosNode = null;
        foreach ($complemento as $key => $value) {
            if (str_contains($key, 'Pagos')) {
                $pagosNode = $value;
                break;
            }
        }

        if (!$pagosNode) return [];

        // pago20:Pago can be a single node or an array of nodes
        $pagoItems = null;
        foreach ($pagosNode as $key => $value) {
            if (str_contains($key, 'Pago')) {
                $pagoItems = $value;
                break;
            }
        }

        if (!$pagoItems) return [];

        // Normalize to array of pago nodes
        if (isset($pagoItems['@attributes'])) {
            $pagoItems = [$pagoItems];
        }

        foreach ($pagoItems as $pago) {
            $attrs      = $pago['@attributes'] ?? [];
            $fechaPago  = $attrs['FechaPago'] ?? null;
            $monedaP    = $attrs['MonedaP'] ?? 'MXN';
            $tcP        = $attrs['TipoCambioP'] ?? 1;

            // DoctoRelacionado items
            $doctos = null;
            foreach ($pago as $key => $value) {
                if (str_contains($key, 'DoctoRelacionado')) {
                    $doctos = $value;
                    break;
                }
            }

            if (!$doctos) continue;

            if (isset($doctos['@attributes'])) {
                $doctos = [$doctos];
            }

            foreach ($doctos as $docto) {
                $da = $docto['@attributes'] ?? [];
                $payments[] = [
                    'uuid_relacionado'  => strtoupper($da['IdDocumento'] ?? ''),
                    'monto_pagado'      => $da['ImpPagado'] ?? ($da['Importe'] ?? 0),
                    'num_parcialidad'   => $da['NumParcialidad'] ?? null,
                    'saldo_anterior'    => $da['ImpSaldoAnt'] ?? null,
                    'saldo_insoluto'    => $da['ImpSaldoInsoluto'] ?? null,
                    'fecha_pago'        => $fechaPago,
                    'moneda_pago'       => $monedaP,
                    'tipo_cambio_pago'  => $tcP,
                ];
            }
        }

        return $payments;
    }
}
