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
            $headerSkipped = false;
            $seenCodes = [];

            foreach ($rows as $row) {
                if (!$headerSkipped) {
                    $headerSkipped = true;
                    continue;
                }
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

                $parentCode = trim((string)($row[4] ?? '0'));
                if (strlen($parentCode) == 8) {
                    $parentCode = substr($parentCode, 0, 3) . '-' . substr($parentCode, 3, 2) . '-' . substr($parentCode, 5, 3);
                }
                if ($parentCode === '0' || $parentCode === '00000000')
                    $parentCode = null;

                $batch[] = [
                    'business_id' => $business->id,
                    'is_custom' => false,
                    'internal_code' => $formattedCode,
                    'sat_code' => $row[16] ?? '',
                    'sat_agrupador' => $row[16] ?? '',
                    'name' => trim($row[2] ?? 'S/N'),
                    'level' => (int)($row[7] ?? 1),
                    'type' => $typeMap[strtoupper($row[0] ?? '')] ?? 'Activo',
                    'naturaleza' => $natureMap[strtoupper($row[5] ?? '')] ?? 'Deudora',
                    'parent_code' => $parentCode,
                    'nif_rubro' => trim((string)($row[10] ?? '')),
                    'is_selectable' => true,
                    'is_postable' => ((int)($row[7] ?? 1) >= 2),
                    'currency' => 'MXN',
                    'is_cash_flow' => false,
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

    public function importExcel(Request $request)
    {
        $business = $this->getBusiness($request);
        $file = $request->file('file');
        if (!$file)
            return response()->json(['message' => 'Archivo no encontrado'], 400);

        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file->getRealPath());
        $rows = $spreadsheet->getActiveSheet()->toArray();

        $batch = [];
        $headerSkipped = false;
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

        foreach ($rows as $row) {
            if (!$headerSkipped) {
                $headerSkipped = true;
                continue;
            }
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
