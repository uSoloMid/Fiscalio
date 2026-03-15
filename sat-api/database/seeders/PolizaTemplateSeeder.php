<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Business;
use App\Models\PolizaTemplate;
use Illuminate\Database\Seeder;

/**
 * Siembra las plantillas de póliza base para todos los negocios.
 * Es idempotente: no duplica si ya existe una plantilla con el mismo nombre.
 *
 * Uso:
 *   php artisan db:seed --class=PolizaTemplateSeeder
 */
class PolizaTemplateSeeder extends Seeder
{
    // Códigos del catálogo importado de CONTPAQi
    // Ajusta aquí si algún negocio usa códigos distintos
    private const CODES = [
        'ventas'              => '401-01-000',  // Ventas y/o servicios gravados a la tasa general
        'iva_no_cobrado'      => '209-01-000',  // IVA trasladado no cobrado
        'iva_cobrado'         => '208-01-000',  // IVA trasladado cobrado
        'isr_retenido'        => '216-04-000',  // ISR retenido por servicios profesionales
        'iva_retenido'        => '216-10-000',  // IVA retenido
    ];

    public function run(): void
    {
        $businesses = Business::all();

        foreach ($businesses as $business) {
            $this->command->info("Procesando: {$business->rfc} — {$business->business_name}");

            // Resolver cuentas para este negocio
            $acc = [];
            foreach (self::CODES as $key => $code) {
                $account = Account::where('business_id', $business->id)
                    ->where('internal_code', $code)
                    ->first();

                if ($account) {
                    $acc[$key] = $account->id;
                    $this->command->line("  ✓ {$key}: [{$code}] {$account->name}");
                } else {
                    $acc[$key] = null;
                    $this->command->warn("  ✗ {$key}: [{$code}] NO encontrada — línea quedará sin cuenta");
                }
            }

            // ── Plantilla 1: Provisión de Venta ──────────────────────────────
            $this->seedTemplate($business->id, [
                'name'               => 'Provisión de Venta',
                'tipo_poliza'        => 3,          // Diario
                'trigger_type'       => 'cfdi',
                'cfdi_tipo'          => 'I',
                'cfdi_role'          => 'emisor',
                'movement_direction' => null,
                'concepto_template'  => 'Prov. Venta {nombre} {fecha}',
            ], [
                [
                    'sort_order'     => 1,
                    'tipo_movto'     => 0,           // Cargo
                    'account_source' => 'rfc_cliente',
                    'account_id'     => null,
                    'importe_source' => 'cfdi_total',
                    'concepto_line'  => 'Clientes',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 2,
                    'tipo_movto'     => 1,           // Abono
                    'account_source' => 'fixed',
                    'account_id'     => $acc['ventas'],
                    'importe_source' => 'cfdi_subtotal',
                    'concepto_line'  => 'Ingresos',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 3,
                    'tipo_movto'     => 1,           // Abono
                    'account_source' => 'fixed',
                    'account_id'     => $acc['iva_no_cobrado'],
                    'importe_source' => 'cfdi_iva',
                    'concepto_line'  => 'IVA Trasladado No Cobrado',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 4,
                    'tipo_movto'     => 0,           // Cargo (retención = nos la guardan)
                    'account_source' => 'fixed',
                    'account_id'     => $acc['isr_retenido'],
                    'importe_source' => 'cfdi_retencion_isr',
                    'concepto_line'  => 'ISR Retenido',
                    'is_optional'    => true,
                ],
                [
                    'sort_order'     => 5,
                    'tipo_movto'     => 0,           // Cargo
                    'account_source' => 'fixed',
                    'account_id'     => $acc['iva_retenido'],
                    'importe_source' => 'cfdi_retencion_iva',
                    'concepto_line'  => 'IVA Retenido',
                    'is_optional'    => true,
                ],
            ]);

            // ── Plantilla 2: Cobro ────────────────────────────────────────────
            $this->seedTemplate($business->id, [
                'name'               => 'Cobro',
                'tipo_poliza'        => 1,          // Ingreso
                'trigger_type'       => 'movement',
                'cfdi_tipo'          => null,
                'cfdi_role'          => null,
                'movement_direction' => 'abono',
                'concepto_template'  => 'Cobro {nombre} {fecha}',
            ], [
                [
                    'sort_order'     => 1,
                    'tipo_movto'     => 0,           // Cargo
                    'account_source' => 'banco',
                    'account_id'     => null,
                    'importe_source' => 'movement_amount',
                    'concepto_line'  => 'Banco',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 2,
                    'tipo_movto'     => 1,           // Abono
                    'account_source' => 'rfc_cliente',
                    'account_id'     => null,
                    'importe_source' => 'movement_amount',
                    'concepto_line'  => 'Clientes',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 3,
                    'tipo_movto'     => 0,           // Cargo (sale de no cobrado)
                    'account_source' => 'fixed',
                    'account_id'     => $acc['iva_no_cobrado'],
                    'importe_source' => 'cfdi_iva',
                    'concepto_line'  => 'IVA Trasladado No Cobrado',
                    'is_optional'    => false,
                ],
                [
                    'sort_order'     => 4,
                    'tipo_movto'     => 1,           // Abono (pasa a cobrado)
                    'account_source' => 'fixed',
                    'account_id'     => $acc['iva_cobrado'],
                    'importe_source' => 'cfdi_iva',
                    'concepto_line'  => 'IVA Trasladado Cobrado',
                    'is_optional'    => false,
                ],
            ]);
        }

        $this->command->info('Seeder completado.');
    }

    private function seedTemplate(int $businessId, array $template, array $lines): void
    {
        $existing = PolizaTemplate::where('business_id', $businessId)
            ->where('name', $template['name'])
            ->first();

        if ($existing) {
            $this->command->line("  → Plantilla '{$template['name']}' ya existe (id={$existing->id}), omitida.");
            return;
        }

        $t = PolizaTemplate::create(array_merge($template, ['business_id' => $businessId]));

        foreach ($lines as $line) {
            $t->lines()->create($line);
        }

        $this->command->info("  ✓ Plantilla '{$template['name']}' creada (id={$t->id}).");
    }
}
