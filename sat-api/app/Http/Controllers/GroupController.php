<?php

namespace App\Http\Controllers;

use App\Models\Group;
use App\Models\Business;
use Illuminate\Http\Request;

class GroupController extends Controller
{
    public function index()
    {
        return response()->json(Group::withCount('businesses')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|unique:groups,name',
            'color' => 'nullable|string'
        ]);

        return response()->json(Group::create($request->all()));
    }

    public function update(Request $request, $id)
    {
        $group = Group::findOrFail($id);
        $request->validate([
            'name' => 'required|string|unique:groups,name,' . $id,
            'color' => 'nullable|string'
        ]);

        $group->update($request->all());
        return response()->json($group);
    }

    public function destroy($id)
    {
        $group = Group::findOrFail($id);
        // Desasignar de negocios
        Business::where('group_id', $id)->update(['group_id' => null]);
        $group->delete();
        return response()->json(['success' => true]);
    }
}
