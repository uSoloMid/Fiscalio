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
        // Si existe el primer negocio (César), lo usamos como plantilla maestra porque está limpio y jerarquizado
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
            'is_cash_flow' => 'boolean',
            'is_active' => 'boolean',
            'description' => 'nullable|string'
        ]);

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
            'is_cash_flow' => 'boolean',
            'is_active' => 'boolean',
            'description' => 'nullable|string'
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
