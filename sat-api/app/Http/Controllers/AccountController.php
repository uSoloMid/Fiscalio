<?php

namespace App\Http\Controllers;

use App\Models\Account;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function index(Request $request)
    {
        $business = $this->getBusiness($request);
        $query = Account::where('business_id', $business->id);

        if (Account::where('business_id', $business->id)->count() === 0) {
            $this->seedCatalog($business);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('internal_code', 'like', "%{$search}%")
                    ->orWhere('sat_code', 'like', "%{$search}%");
            });
        }

        if ($type = $request->input('type')) {
            if ($type !== 'all') {
                $query->where('type', $type);
            }
        }

        if ($request->boolean('only_postable')) {
            $query->where('is_postable', true);
        }

        if ($request->boolean('without_sat')) {
            $query->where(function ($q) {
                $q->whereNull('sat_code')->orWhere('sat_code', '');
            });
        }

        if ($parent = $request->input('parent_code')) {
            $query->where('parent_code', $parent);
        }

        return response()->json($query->orderBy('internal_code')->get());
    }

    protected function seedCatalog($business)
    {
        $filePath = base_path('../cuentas.xls');
        if (file_exists($filePath)) {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($filePath);
            $rows = $spreadsheet->getActiveSheet()->toArray();

            $typeMap = ['A' => 'Activo', 'P' => 'Pasivo', 'C' => 'Capital', 'I' => 'Ingresos', 'E' => 'Egresos', 'G' => 'Egresos', 'O' => 'Orden'];
            $natureMap = ['L' => 'Deudora', 'K' => 'Acreedora', 'D' => 'Deudora', 'A' => 'Acreedora'];

            $batch = [];
            $seenCodes = [];
            $cashFlowCodes = [];

            // First pass: collect cash-flow marker codes (type=F with empty name)
            foreach ($rows as $idx => $row) {
                if ($idx < 4) continue;
                $tc = strtoupper(trim((string)($row[0] ?? '')));
                $rc = trim((string)($row[1] ?? ''));
                $nm = trim((string)($row[2] ?? ''));
                if (empty($rc) || $tc === 'RF' || $tc !== 'F' || !empty($nm)) continue;
                $fc = (strlen($rc) == 8 && is_numeric($rc))
                    ? substr($rc, 0, 3) . '-' . substr($rc, 3, 2) . '-' . substr($rc, 5, 3)
                    : $rc;
                $cashFlowCodes[$fc] = true;
            }

            foreach ($rows as $idx => $row) {
                if ($idx < 4)
                    continue;

                $typeCode = $row[0] ?? '';
                $rawCode = trim((string)($row[1] ?? ''));
                $name = trim((string)($row[2] ?? ''));

                if (empty($rawCode))
                    continue;

                $tc = strtoupper(trim((string)$typeCode));
                // Skip RF rows (NIF rubro references, not real accounts)
                if ($tc === 'RF') continue;
                // Skip type=F rows with empty names (cash-flow markers only)
                if (empty($name) && $tc === 'F') continue;

                $formattedCode = $rawCode;
                if (strlen($rawCode) == 8 && is_numeric($rawCode)) {
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

                $parentCode = trim((string)($row[4] ?? ''));
                if (strlen($parentCode) == 8 && is_numeric($parentCode)) {
                    $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
                }
                if ($parentCode === '0' || $parentCode === '00000000' || empty($parentCode))
                    $parentCode = null;

                $batch[] = [
                    'business_id' => $business->id,
                    'is_custom' => false,
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
                    'currency' => 'MXN',
                    'is_cash_flow' => isset($cashFlowCodes[$formattedCode]),
                    'is_active' => true,
                    'balance' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                if (count($batch) >= 100) {
                    Account::insert($batch);
                    $batch = [];
                }
            }
            if (!empty($batch))
                Account::insert($batch);
            return;
        }

        // Si existe el primer negocio (César), lo usamos como plantilla maestra
        $masterBusiness = \App\Models\Business::find(1);
        if ($masterBusiness && $masterBusiness->id !== $business->id) {
            $masterAccounts = Account::where('business_id', $masterBusiness->id)
                ->where('is_custom', false)
                ->get();

            if ($masterAccounts->count() > 0) {
                $batch = [];
                foreach ($masterAccounts as $ma) {
                    $batch[] = [
                        'business_id' => $business->id,
                        'is_custom' => false,
                        'internal_code' => $ma->internal_code,
                        'sat_code' => $ma->sat_code,
                        'name' => $ma->name,
                        'level' => $ma->level,
                        'type' => $ma->type,
                        'naturaleza' => $ma->naturaleza,
                        'parent_code' => $ma->parent_code,
                        'is_selectable' => $ma->is_selectable,
                        'is_postable' => $ma->is_postable,
                        'currency' => $ma->currency,
                        'nif_rubro' => $ma->nif_rubro,
                        'sat_agrupador' => $ma->sat_agrupador,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                    if (count($batch) >= 100) {
                        Account::insert($batch);
                        $batch = [];
                    }
                }
                if (!empty($batch))
                    Account::insert($batch);
                return;
            }
        }

        // Fallback al JSON original si no hay plantilla maestra
        $jsonPath = base_path('../catalogo_cuentas_sat.json');
        if (!file_exists($jsonPath))
            return;

        $catalog = json_decode(file_get_contents($jsonPath), true);
        if (!$catalog)
            return;

        $batch = [];
        $insertedCodes = [];

        foreach ($catalog as $item) {
            $code = $item['codigo_interno'];
            $name = $item['nombre'];

            // Limpieza de nombres y códigos si vienen del JSON sucio
            if (preg_match('/^(\d+(\.\d+)*)\s+(.*)/', $name, $matches)) {
                $rawCode = $matches[1];
                $name = $matches[3]; // Quitar el número del nombre

                if ($code === '001-00-000' || $code === '002-00-000') {
                    $parts = explode('.', $rawCode);
                    $p1 = str_pad($parts[0], 3, '0', STR_PAD_LEFT);
                    $p2 = str_pad($parts[1] ?? '0', 2, '0', STR_PAD_LEFT);
                    $p3 = str_pad($parts[2] ?? '0', 3, '0', STR_PAD_LEFT);
                    $code = "$p1-$p2-$p3";
                }
            }

            if (in_array($code, $insertedCodes))
                continue;
            $insertedCodes[] = $code;

            $batch[] = [
                'business_id' => $business->id,
                'is_custom' => false,
                'internal_code' => $code,
                'sat_code' => $item['codigo_sat'],
                'name' => $name,
                'level' => $item['nivel'],
                'type' => $item['tipo'],
                'naturaleza' => $item['naturaleza'],
                'is_selectable' => true,
                'is_postable' => ($item['nivel'] >= 2),
                'currency' => 'MXN',
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (count($batch) >= 100) {
                Account::insert($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            Account::insert($batch);
        }
    }

    public function exportExcel(Request $request)
    {
        $business = $this->getBusiness($request);
        $accounts = Account::where('business_id', $business->id)
            ->orderBy('internal_code')
            ->get();

        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();

        // 4 header rows (matching Contpaqi format)
        $sheet->setCellValue('A1', 'Tipo');
        $sheet->setCellValue('B1', 'Código Interno');
        $sheet->setCellValue('C1', 'Nombre');
        $sheet->setCellValue('E1', 'Cuenta Padre');
        $sheet->setCellValue('F1', 'Naturaleza');
        $sheet->setCellValue('H1', 'Nivel');
        $sheet->setCellValue('K1', 'Rubro NIF');
        $sheet->setCellValue('Q1', 'Vínculo SAT');

        $typeReverseMap = [
            'Activo'   => 'A',
            'Pasivo'   => 'P',
            'Capital'  => 'C',
            'Ingresos' => 'I',
            'Egresos'  => 'E',
            'Orden'    => 'O',
        ];
        $natureReverseMap = ['Deudora' => 'D', 'Acreedora' => 'A'];

        $row = 5;
        foreach ($accounts as $account) {
            // Remove dashes to get 8-digit code
            $rawCode   = str_replace('-', '', $account->internal_code);
            $parentRaw = $account->parent_code
                ? str_replace('-', '', $account->parent_code)
                : '00000000';

            $sheet->setCellValueExplicit("A{$row}", $typeReverseMap[$account->type] ?? 'A', \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            $sheet->setCellValueExplicit("B{$row}", $rawCode, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            $sheet->setCellValue("C{$row}", $account->name);
            $sheet->setCellValueExplicit("E{$row}", $parentRaw, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            $sheet->setCellValue("F{$row}", $natureReverseMap[$account->naturaleza] ?? 'D');
            $sheet->setCellValue("H{$row}", $account->level);
            $sheet->setCellValue("K{$row}", $account->nif_rubro ?? '');
            $sheet->setCellValue("Q{$row}", $account->sat_code ?? '');
            $row++;
        }

        $filename = 'Catalogo_' . $business->rfc . '_' . date('Y-m-d') . '.xlsx';
        $writer   = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    public function importTxt(Request $request)
    {
        $business = $this->getBusiness($request);
        $file = $request->file('file');
        if (!$file)
            return response()->json(['message' => 'Archivo no encontrado'], 400);

        // mode: 'upsert' (default) = update existing + add new | 'new_only' = skip existing
        $mode = $request->input('mode', 'upsert');

        // Read raw bytes — Contpaqi TXT uses Windows-1252 fixed-width fields.
        // We MUST parse numeric/structural fields from raw bytes BEFORE any encoding
        // conversion, because multibyte UTF-8 chars (ó=2B, ñ=2B) would shift positions.
        $rawContent = file_get_contents($file->getRealPath());
        $rawLines   = preg_split('/\r\n|\r|\n/', $rawContent);

        // Helper: extract a field at a byte position and convert it to UTF-8
        $field = function (string $line, int $pos, int $len) {
            $raw = substr($line, $pos, $len);
            // Convert from Windows-1252 to UTF-8 (single-byte source, so positions are stable)
            return trim(mb_convert_encoding($raw, 'UTF-8', 'Windows-1252'));
        };

        $natureMap = ['L' => 'Deudora', 'K' => 'Acreedora', 'D' => 'Deudora', 'A' => 'Acreedora'];

        // First pass: collect cash-flow codes and NIF rubros (from RF lines following C lines)
        $cashFlowCodes = [];
        $nifRubros     = [];
        $lastCode      = null;

        foreach ($rawLines as $line) {
            if (strlen($line) < 4) continue;
            $prefix = strtoupper(substr($line, 0, 2));

            if ($prefix === 'RF') {
                $nifRubro = $field($line, 3, strlen($line));
                if ($lastCode && !empty($nifRubro)) {
                    $nifRubros[$lastCode] = $nifRubro;
                }
                $lastCode = null;
                continue;
            }

            $tc      = strtoupper(substr($line, 0, 1));
            $rawCode = trim(substr($line, 3, 8));
            if (empty($rawCode) || !is_numeric($rawCode)) { $lastCode = null; continue; }

            $fc = strlen($rawCode) == 8
                ? substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3)
                : $rawCode;

            if ($tc === 'F') {
                $nameRaw = trim(substr($line, 34, 50));
                if (empty($nameRaw)) { $cashFlowCodes[$fc] = true; $lastCode = null; continue; }
            }

            $lastCode = $fc;
        }

        // Second pass: build accounts — all positions in BYTES (Windows-1252)
        $batch     = [];
        $seenCodes = [];
        $count     = 0;

        foreach ($rawLines as $line) {
            if (strlen($line) < 11) continue;
            if (strtoupper(substr($line, 0, 2)) === 'RF') continue;

            $typeCode = substr($line, 0, 1);
            $tc       = strtoupper($typeCode);
            $rawCode  = trim(substr($line, 3, 8));

            if (empty($rawCode) || !is_numeric($rawCode)) continue;

            // Name: Spanish name at bytes 34-83 (50 bytes)
            $name = $field($line, 34, 50);
            if (empty($name) && $tc === 'F') continue;

            $formattedCode = strlen($rawCode) == 8
                ? substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3)
                : $rawCode;

            if (isset($seenCodes[$formattedCode])) continue;
            $seenCodes[$formattedCode] = true;

            // Parent at bytes 136-143 (8 bytes, always numeric)
            $parentCode = null;
            if (strlen($line) > 143) {
                $parentRaw = substr($line, 136, 8);
                if (is_numeric($parentRaw) && $parentRaw !== '00000000') {
                    $parentCode = substr($parentRaw, 0, 3) . '-' . substr($parentRaw, 3, 2) . '-' . substr($parentRaw, 5, 3);
                }
            }

            // Nature at byte 167 (1 byte), level at byte 171 (1 byte)
            $nature     = strlen($line) > 167 ? strtoupper(substr($line, 167, 1)) : 'L';
            $naturaleza = $natureMap[$nature] ?? 'Deudora';
            $level      = 1;
            if (strlen($line) > 171) {
                $lvl = substr($line, 171, 1);
                if (is_numeric($lvl)) $level = (int)$lvl;
            }

            // Type by first digit
            $firstDigit = substr($rawCode, 0, 1);
            switch ($firstDigit) {
                case '1': $type = 'Activo'; break;
                case '2': $type = 'Pasivo'; break;
                case '3': $type = 'Capital'; break;
                case '4': $type = 'Ingresos'; break;
                case '5': case '6': case '7': $type = 'Egresos'; break;
                default: $type = 'Orden'; break;
            }

            // SAT agrupador = last non-whitespace token of the C line
            $parts   = preg_split('/\s+/', rtrim($line));
            $lastTok = end($parts);
            $satCode = ($lastTok && $lastTok !== '0') ? $lastTok : '';

            // NIF rubro comes from the RF line collected in first pass
            $nifRubro = $nifRubros[$formattedCode] ?? '';

            $batch[] = [
                'business_id'   => $business->id,
                'is_custom'     => false,
                'internal_code' => $formattedCode,
                'sat_code'      => $satCode,
                'sat_agrupador' => $satCode,
                'name'          => $name ?: 'S/N (' . $typeCode . ')',
                'level'         => $level,
                'type'          => $type,
                'naturaleza'    => $naturaleza,
                'parent_code'   => $parentCode,
                'nif_rubro'     => $nifRubro,
                'is_selectable' => true,
                'is_postable'   => ($level >= 2),
                'currency'      => 'MXN',
                'is_cash_flow'  => isset($cashFlowCodes[$formattedCode]),
                'is_active'     => true,
                'created_at'    => now(),
                'updated_at'    => now(),
            ];

            if (count($batch) >= 100) {
                if ($mode === 'new_only') {
                    DB::table('accounts')->insertOrIgnore($batch);
                } else {
                    Account::upsert($batch, ['business_id', 'internal_code'],
                        ['name', 'level', 'type', 'naturaleza', 'parent_code', 'sat_code',
                         'sat_agrupador', 'nif_rubro', 'is_postable', 'is_cash_flow']);
                }
                $count += count($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            if ($mode === 'new_only') {
                DB::table('accounts')->insertOrIgnore($batch);
            } else {
                Account::upsert($batch, ['business_id', 'internal_code'],
                    ['name', 'level', 'type', 'naturaleza', 'parent_code', 'sat_code',
                     'sat_agrupador', 'nif_rubro', 'is_postable', 'is_cash_flow']);
            }
            $count += count($batch);
        }

        $modeLabel = $mode === 'new_only' ? 'nuevas cuentas agregadas' : 'cuentas importadas/actualizadas';
        return response()->json(['message' => "Se procesaron {$count} {$modeLabel} desde TXT Contpaqi.", 'imported' => $count]);
    }

    public function importExcel(Request $request)
    {
        $business = $this->getBusiness($request);
        $file = $request->file('file');
        if (!$file)
            return response()->json(['message' => 'Archivo no encontrado'], 400);

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file->getRealPath());
        $rows = $spreadsheet->getActiveSheet()->toArray();

        $batch = [];
        $count = 0;

        // Type mapping
        $typeMap = [
            'A' => 'Activo',
            'P' => 'Pasivo',
            'C' => 'Capital',
            'I' => 'Ingresos',
            'E' => 'Egresos',
            'G' => 'Egresos', // Gastos
            'O' => 'Orden',
        ];

        // Nature mapping
        $natureMap = [
            'L' => 'Deudora',
            'K' => 'Acreedora',
            'D' => 'Deudora',
            'A' => 'Acreedora',
        ];

        foreach ($rows as $idx => $row) {
            if ($idx < 4) continue; // skip 4 Contpaqi header rows
            if (empty($row[1]))
                continue; // internal_code

            $rawCode = trim($row[1]);
            // Format 10101001 -> 101-01-001 or similar if needed
            // For now, we will store it as is or try to match the AAA-BB-CCC pattern
            $formattedCode = $rawCode;
            if (strlen($rawCode) == 8) {
                $formattedCode = substr($rawCode, 0, 3) . '-' . substr($rawCode, 3, 2) . '-' . substr($rawCode, 5, 3);
            }

            $parentCode = trim($row[4] ?? '');
            if (strlen($parentCode) == 8) {
                $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
            }
            if ($parentCode === '0' || $parentCode === '00000000')
                $parentCode = null;

            $batch[] = [
                'business_id' => $business->id,
                'is_custom' => true,
                'internal_code' => $formattedCode,
                'sat_code' => $row[16] ?? null,
                'sat_agrupador' => $row[16] ?? null,
                'name' => trim($row[2]),
                'level' => (int)($row[7] ?? 1),
                'type' => $typeMap[strtoupper($row[0] ?? '')] ?? 'Activo',
                'naturaleza' => $natureMap[strtoupper($row[5] ?? '')] ?? 'Deudora',
                'parent_code' => $parentCode,
                'nif_rubro' => trim($row[10] ?? ''),
                'is_selectable' => true,
                'is_postable' => ((int)($row[7] ?? 1) >= 2),
                'currency' => 'MXN',
                'created_at' => now(),
                'updated_at' => now(),
            ];

            if (count($batch) >= 100) {
                Account::upsert($batch, ['business_id', 'internal_code'], ['name', 'level', 'type', 'naturaleza', 'parent_code', 'sat_code', 'sat_agrupador', 'nif_rubro', 'is_postable']);
                $count += count($batch);
                $batch = [];
            }
        }

        if (!empty($batch)) {
            Account::upsert($batch, ['business_id', 'internal_code'], ['name', 'level', 'type', 'naturaleza', 'parent_code', 'sat_code', 'sat_agrupador', 'nif_rubro', 'is_postable']);
            $count += count($batch);
        }

        return response()->json(['message' => "Se importaron/actualizaron $count cuentas correctamente."]);
    }

    public function show(Request $request, $id)
    {
        $business = $this->getBusiness($request);
        return response()->json(Account::where('business_id', $business->id)->findOrFail($id));
    }

    public function store(Request $request)
    {
        $business = $this->getBusiness($request);

        $validated = $request->validate([
            'internal_code' => [
                'required',
                'string',
                \Illuminate\Validation\Rule::unique('accounts')->where(function ($query) use ($business) {
            return $query->where('business_id', $business->id);
        }),
            ],
            'sat_code' => 'nullable|string',
            'name' => 'required|string',
            'level' => 'required|integer',
            'type' => 'required|string',
            'naturaleza' => 'required|string',
            'parent_code' => 'nullable|string',
            'is_postable' => 'boolean',
            'generate_auxiliaries' => 'boolean',
            'currency' => 'string|max:3',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
            'nif_rubro' => 'nullable|string',
            'sat_agrupador' => 'nullable|string',
        ]);

        if (!empty($validated['parent_code'])) {
            $parent = Account::where('business_id', $business->id)
                ->where('internal_code', $validated['parent_code'])
                ->first();

            if ($parent) {
                if (empty($validated['nif_rubro'])) {
                    $validated['nif_rubro'] = $parent->nif_rubro;
                }
                if (empty($validated['sat_agrupador'])) {
                    $validated['sat_agrupador'] = $parent->sat_agrupador;
                }
            }
        }

        $validated['business_id'] = $business->id;
        $validated['is_custom'] = true;

        $account = Account::create($validated);
        return response()->json($account, 201);
    }

    public function update(Request $request, $id)
    {
        $business = $this->getBusiness($request);
        $account = Account::where('business_id', $business->id)->findOrFail($id);

        $validated = $request->validate([
            'internal_code' => [
                'sometimes',
                'required',
                'string',
                \Illuminate\Validation\Rule::unique('accounts')->where(function ($query) use ($business) {
            return $query->where('business_id', $business->id);
        })->ignore($id),
            ],
            'sat_code' => 'nullable|string',
            'name' => 'sometimes|required|string',
            'level' => 'sometimes|required|integer',
            'type' => 'sometimes|required|string',
            'naturaleza' => 'sometimes|required|string',
            'parent_code' => 'nullable|string',
            'is_postable' => 'boolean',
            'generate_auxiliaries' => 'boolean',
            'currency' => 'string|max:3',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
            'nif_rubro' => 'nullable|string',
            'sat_agrupador' => 'nullable|string',
        ]);

        $account->update($validated);
        return response()->json($account);
    }

    public function destroy(Request $request, $id)
    {
        $business = $this->getBusiness($request);
        $account = Account::where('business_id', $business->id)->findOrFail($id);

        if (!$account->is_custom) {
            return response()->json(['message' => 'No puedes eliminar cuentas originales del catálogo.'], 403);
        }

        if ($account->balance != 0) {
            return response()->json(['message' => 'No puedes eliminar una cuenta que tiene movimientos o saldo.'], 403);
        }

        $hasChildren = Account::where('business_id', $business->id)
            ->where('parent_code', $account->internal_code)
            ->exists();

        if ($hasChildren) {
            return response()->json(['message' => 'No puedes eliminar una cuenta que tiene subcuentas.'], 403);
        }

        $account->delete();
        return response()->json(null, 204);
    }

    protected function getBusiness(Request $request)
    {
        $rfc = $request->input('rfc') ?? $request->header('X-Business-RFC');
        if (!$rfc) {
            abort(400, 'Business RFC is required (rfc parameter or X-Business-RFC header)');
        }
        return \App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail();
    }
}
