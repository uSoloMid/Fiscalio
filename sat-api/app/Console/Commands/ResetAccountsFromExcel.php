<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Account;
use App\Models\Business;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Illuminate\Support\Facades\DB;

class ResetAccountsFromExcel extends Command
{
    protected $signature = 'accounts:reset-from-excel';
    protected $description = 'Resets all account catalogs for all clients based on cuentas.xls';

    public function handle()
    {
        $filePath = base_path('../cuentas.xls');
        if (!file_exists($filePath)) {
            $this->error("No se encontró el archivo cuentas.xls en la raíz.");
            return 1;
        }

        $this->info("Cargando cuentas.xls...");
        $spreadsheet = IOFactory::load($filePath);
        $rows = $spreadsheet->getActiveSheet()->toArray();

        $typeMap = [
            'A' => 'Activo',
            'P' => 'Pasivo',
            'C' => 'Capital',
            'I' => 'Ingresos',
            'E' => 'Egresos',
            'G' => 'Egresos',
            'O' => 'Orden',
        ];

        $natureMap = [
            'L' => 'Deudora',
            'K' => 'Acreedora',
            'D' => 'Deudora',
            'A' => 'Acreedora',
        ];

        $baseCatalog = [];
        $headerSkipped = false;
        $seenInExcel = [];

        foreach ($rows as $rowSpec) {
            if (!$headerSkipped) {
                $headerSkipped = true;
                continue;
            }
            if (empty($rowSpec[1]))
                continue;

            $rawCode = trim((string)$rowSpec[1]);
            $formattedCode = $rawCode;
            if (strlen($rawCode) == 8) {
                $formattedCode = substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3);
            }

            if (isset($seenInExcel[$formattedCode]))
                continue;
            $seenInExcel[$formattedCode] = true;

            $parentCode = trim((string)($rowSpec[4] ?? ''));
            if (strlen($parentCode) == 8) {
                $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
            }
            if ($parentCode === '0' || $parentCode === '00000000')
                $parentCode = null;

            $baseCatalog[] = [
                'internal_code' => $formattedCode,
                'sat_code' => $rowSpec[16] ?? '',
                'sat_agrupador' => $rowSpec[16] ?? '',
                'name' => trim($rowSpec[2] ?? 'S/N'),
                'level' => (int)($rowSpec[7] ?? 1),
                'type' => $typeMap[strtoupper($rowSpec[0] ?? '')] ?? 'Activo',
                'naturaleza' => $natureMap[strtoupper($rowSpec[5] ?? '')] ?? 'Deudora',
                'parent_code' => $parentCode,
                'nif_rubro' => trim((string)($rowSpec[10] ?? '')),
                'is_selectable' => true,
                'is_postable' => ((int)($rowSpec[7] ?? 1) >= 2),
                'generate_auxiliaries' => false,
                'currency' => 'MXN',
                'is_cash_flow' => false,
                'is_active' => true,
                'is_custom' => false,
                'balance' => 0,
            ];
        }

        $businesses = Business::all();
        $this->info("Reseteando catálogos para " . $businesses->count() . " empresas...");

        foreach ($businesses as $business) {
            $this->info("Procesando: {$business->common_name} ({$business->rfc})...");

            DB::beginTransaction();
            try {
                // Borrar todas las cuentas actuales
                Account::where('business_id', $business->id)->delete();

                $batch = [];
                foreach ($baseCatalog as $item) {
                    $item['business_id'] = $business->id;
                    $item['created_at'] = now();
                    $item['updated_at'] = now();

                    if (empty($item['sat_code']))
                        $item['sat_code'] = '';

                    $batch[] = $item;

                    if (count($batch) >= 100) {
                        Account::insert($batch);
                        $batch = [];
                    }
                }
                if (!empty($batch)) {
                    Account::insert($batch);
                }
                DB::commit();
                $this->info("  -> OK: Generadas " . count($baseCatalog) . " cuentas.");
            }
            catch (\Exception $e) {
                DB::rollBack();
                $this->error("  -> ERROR: " . $e->getMessage());
            }
        }

        $this->info("¡Reinicio completo!");
        return 0;
    }
}
