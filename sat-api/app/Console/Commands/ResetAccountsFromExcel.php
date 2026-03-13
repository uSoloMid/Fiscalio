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
    protected $description = 'Resets all account catalogs for all clients based on cuentas.xls strictly following Contpaqi format';

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

        $natureMap = [
            'L' => 'Deudora',
            'K' => 'Acreedora',
            'D' => 'Deudora',
            'A' => 'Acreedora',
        ];

        $baseCatalog = [];
        $seenCodes   = [];
        $cashFlowCodes = [];

        // First pass: collect codes marked as cash-flow (type=F with empty name)
        foreach ($rows as $idx => $row) {
            if ($idx < 4) continue;
            $typeCode = strtoupper(trim((string)($row[0] ?? '')));
            $rawCode  = trim((string)($row[1] ?? ''));
            $name     = trim((string)($row[2] ?? ''));
            if (empty($rawCode) || $typeCode !== 'F' || !empty($name)) continue;
            $fc = (strlen($rawCode) == 8 && is_numeric($rawCode))
                ? substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3)
                : $rawCode;
            $cashFlowCodes[$fc] = true;
        }

        // Second pass: build catalog skipping empty-name marker rows
        foreach ($rows as $idx => $row) {
            if ($idx < 4)
                continue;

            $typeCode = $row[0] ?? '';
            $rawCode = trim((string)($row[1] ?? ''));
            $name = trim((string)($row[2] ?? ''));

            if (empty($rawCode))
                continue;

            // Skip type=F rows with empty names — they are cash-flow markers, not real accounts
            if (empty($name) && strtoupper(trim((string)$typeCode)) === 'F')
                continue;

            // Format code to AAA-BB-CCC if it has 8 digits
            $formattedCode = $rawCode;
            if (strlen($rawCode) == 8 && is_numeric($rawCode)) {
                $formattedCode = substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3);
            }

            if (isset($seenCodes[$formattedCode]))
                continue;
            $seenCodes[$formattedCode] = true;

            // Determine type by first character of code if not explicitly Activo/Pasivo
            $firstDigit = substr($rawCode, 0, 1);
            $type = 'Activo';
            switch ($firstDigit) {
                case '1':
                    $type = 'Activo';
                    break;
                case '2':
                    $type = 'Pasivo';
                    break;
                case '3':
                    $type = 'Capital';
                    break;
                case '4':
                    $type = 'Ingresos';
                    break;
                case '5':
                case '6':
                case '7':
                    $type = 'Egresos';
                    break;
                default:
                    $type = 'Orden';
                    break;
            }

            $parentCode = trim((string)($row[4] ?? ''));
            if (strlen($parentCode) == 8 && is_numeric($parentCode)) {
                $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
            }
            if ($parentCode === '0' || $parentCode === '00000000' || empty($parentCode))
                $parentCode = null;

            $baseCatalog[] = [
                'internal_code' => $formattedCode,
                'sat_code' => trim((string)($row[16] ?? '')),
                'sat_agrupador' => trim((string)($row[16] ?? '')),
                'name' => $name ?: 'S/N (' . $typeCode . ')',
                'level' => (int)($row[7] ?? 1),
                'type' => $type,
                'naturaleza' => $natureMap[strtoupper($row[5] ?? '')] ?? 'Deudora',
                'parent_code' => $parentCode,
                'nif_rubro' => trim((string)($row[10] ?? '')),
                'is_selectable' => true,
                'is_postable' => ((int)($row[7] ?? 1) >= 2),
                'generate_auxiliaries' => false,
                'currency' => 'MXN',
                'is_cash_flow' => isset($cashFlowCodes[$formattedCode]),
                'is_active' => true,
                'balance' => 0,
                'is_custom' => false,
            ];
        }

        $businesses = Business::all();
        $this->info("Reseteando catálogos para " . $businesses->count() . " empresas...");

        foreach ($businesses as $business) {
            $this->info("Procesando: {$business->common_name} ({$business->rfc})...");

            DB::beginTransaction();
            try {
                // ABSOLUTE DELETE
                DB::table('accounts')->where('business_id', $business->id)->delete();

                $batch = [];
                foreach ($baseCatalog as $item) {
                    $item['business_id'] = $business->id;
                    $item['created_at'] = now();
                    $item['updated_at'] = now();
                    $batch[] = $item;

                    if (count($batch) >= 100) {
                        DB::table('accounts')->insert($batch);
                        $batch = [];
                    }
                }
                if (!empty($batch)) {
                    DB::table('accounts')->insert($batch);
                }
                DB::commit();
                $this->info("  -> OK: " . count($baseCatalog) . " cuentas.");
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
