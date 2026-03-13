<?php

namespace App\Http\Controllers;

use App\Models\Business;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    /** Lista usuarios del mismo workspace. */
    public function index(Request $request)
    {
        $users = User::where('current_workspace_id', $request->user()->current_workspace_id)
            ->with('businesses:id,rfc,common_name,legal_name')
            ->get()
            ->map(fn($u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'is_admin'   => $u->is_admin,
                'businesses' => $u->businesses,
            ]);

        return response()->json($users);
    }

    /** Crear contador en el mismo workspace. */
    public function store(Request $request)
    {
        $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'is_admin' => 'boolean',
        ]);

        $user = User::create([
            'name'                 => $request->name,
            'email'                => $request->email,
            'password'             => Hash::make($request->password),
            'is_admin'             => $request->boolean('is_admin', false),
            'current_workspace_id' => $request->user()->current_workspace_id,
        ]);

        return response()->json($user, 201);
    }

    /** Actualizar nombre / email / contraseña de un contador. */
    public function update(Request $request, $id)
    {
        $user = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->firstOrFail();

        $request->validate([
            'name'     => 'sometimes|string|max:255',
            'email'    => "sometimes|email|unique:users,email,{$id}",
            'password' => 'sometimes|string|min:6',
            'is_admin' => 'sometimes|boolean',
        ]);

        $data = $request->only(['name', 'email']);
        if ($request->has('is_admin')) {
            $data['is_admin'] = $request->boolean('is_admin');
        }
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);
        return response()->json($user);
    }

    /** Eliminar contador (no puede eliminarse a sí mismo ni a otro admin). */
    public function destroy(Request $request, $id)
    {
        if ($request->user()->id == $id) {
            return response()->json(['message' => 'No puedes eliminarte a ti mismo.'], 422);
        }

        $user = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->firstOrFail();

        $user->delete();
        return response()->json(['success' => true]);
    }

    /** Sincronizar clientes asignados a un contador. */
    public function syncBusinesses(Request $request, $id)
    {
        $request->validate([
            'business_ids'   => 'required|array',
            'business_ids.*' => 'integer|exists:businesses,id',
        ]);

        $contador = User::where('id', $id)
            ->where('current_workspace_id', $request->user()->current_workspace_id)
            ->where('is_admin', false)
            ->firstOrFail();

        // Solo businesses del propio workspace
        $validIds = Business::where('workspace_id', $request->user()->current_workspace_id)
            ->whereIn('id', $request->business_ids)
            ->pluck('id');

        $contador->businesses()->sync($validIds);

        return response()->json(['success' => true, 'assigned' => $validIds]);
    }
}
