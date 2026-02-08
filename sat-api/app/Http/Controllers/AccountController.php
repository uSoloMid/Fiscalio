<?php

namespace App\Http\Controllers;

use App\Models\Account;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function index()
    {
        return response()->json(Account::orderBy('internal_code')->get());
    }

    public function show($id)
    {
        return response()->json(Account::findOrFail($id));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'internal_code' => 'required|string|unique:accounts',
            'sat_code' => 'required|string',
            'name' => 'required|string',
            'level' => 'required|integer',
            'type' => 'required|string',
            'naturaleza' => 'required|string',
            'parent_code' => 'nullable|string',
            'is_selectable' => 'boolean'
        ]);

        $account = Account::create($validated);
        return response()->json($account, 201);
    }

    public function update(Request $request, $id)
    {
        $account = Account::findOrFail($id);

        $validated = $request->validate([
            'internal_code' => 'sometimes|required|string|unique:accounts,internal_code,' . $id,
            'sat_code' => 'sometimes|required|string',
            'name' => 'sometimes|required|string',
            'level' => 'sometimes|required|integer',
            'type' => 'sometimes|required|string',
            'naturaleza' => 'sometimes|required|string',
            'parent_code' => 'nullable|string',
            'is_selectable' => 'boolean'
        ]);

        $account->update($validated);
        return response()->json($account);
    }

    public function destroy($id)
    {
        $account = Account::findOrFail($id);
        $account->delete();
        return response()->json(null, 204);
    }
}
