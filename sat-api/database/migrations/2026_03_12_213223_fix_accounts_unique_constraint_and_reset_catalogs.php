<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use App\Models\Business;
use App\Models\Account;
use PhpOffice\PhpSpreadsheet\IOFactory;

return new class extends Migration 
{
    public function up(): void
    {
        // 1. Fix the schema: Remove global unique index, add composite one
        // SQLite doesn't support dropUnique well on columns defined as UNIQUE in CREATE TABLE
        // So we will recreate the table structure if needed, but Laravel's Schema handles it by recreating the table in SQLite

        try {
            Schema::table('accounts', function (Blueprint $table) {
                // Try to drop the old global unique index
                try {
                    $table->dropUnique(['internal_code']);
                }
                catch (\Exception $e) {
                }

                try {
                    $table->dropUnique('accounts_internal_code_unique');
                }
                catch (\Exception $e) {
                }

                // Add the composite unique index
                try {
                    $table->unique(['business_id', 'internal_code']);
                }
                catch (\Exception $e) {
                }
            });
        }
        catch (\Exception $e) {
        // If Schema fails, we proceed - the main goal is the reset
        }

        // 2. Perform global reset from Excel
        $this->resetAllCatalogs();
    }

    protected function resetAllCatalogs()
    {
        $filePath = base_path('../cuentas.xls');
        if (!file_exists($filePath))
            return;

        $spreadsheet = IOFactory::load($filePath);
        $rows = $spreadsheet->getActiveSheet()->toArray();

        $natureMap = ['L' => 'Deudora', 'K' => 'Acreedora', 'D' => 'Deudora', 'A' => 'Acreedora'];
        $baseCatalog = [];
        $headerSkipped = false;
        $seenCodes = [];

        foreach ($rows as $row) {
            if (!$headerSkipped) {
                $headerSkipped = true;
                continue;
            }
            if (($row[0] ?? '') !== 'C')
                continue;
            if (empty($row[1]))
                continue;

            $rawCode = trim((string)$row[1]);
            $formattedCode = $rawCode;
            if (strlen($rawCode) == 8) {
                $formattedCode = substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3);
            }

            if (isset($seenCodes[$formattedCode]))
                continue;
            $seenCodes[$formattedCode] = true;

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

            $parentCode = trim((string)($row[4] ?? '0'));
            if (strlen($parentCode) == 8) {
                $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
            }
            if ($parentCode === '0' || $parentCode === '00000000')
                $parentCode = null;

            $baseCatalog[] = [
                'internal_code' => $formattedCode,
                'sat_code' => $row[16] ?? '',
                'sat_agrupador' => $row[16] ?? '',
                'name' => trim($row[2] ?? 'S/N'),
                'level' => (int)($row[7] ?? 1),
                'type' => $type,
                'naturaleza' => $natureMap[strtoupper($row[5] ?? '')] ?? 'Deudora',
                'parent_code' => $parentCode,
                'nif_rubro' => trim((string)($row[10] ?? '')),
                'is_selectable' => true,
                'is_postable' => ((int)($row[7] ?? 1) >= 2),
                'generate_auxiliaries' => false,
                'currency' => 'MXN',
                'is_cash_flow' => false,
                'is_active' => true,
                'balance' => 0,
                'is_custom' => false,
            ];
        }

        $businesses = Business::all();
        foreach ($businesses as $business) {
            DB::transaction(function () use ($business, $baseCatalog) {
                Account::where('business_id', $business->id)->delete();
                $batch = [];
                foreach ($baseCatalog as $item) {
                    $item['business_id'] = $business->id;
                    $item['created_at'] = now();
                    $item['updated_at'] = now();
                    $batch[] = $item;
                    if (count($batch) >= 100) {
                        Account::insert($batch);
                        $batch = [];
                    }
                }
                if (!empty($batch))
                    Account::insert($batch);
            });
        }
    }

    public function down(): void
    {
    // No down migration for reset
    }
};
