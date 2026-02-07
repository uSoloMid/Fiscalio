<?php

namespace App\Http\Controllers;

use App\Models\Group;
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
}
