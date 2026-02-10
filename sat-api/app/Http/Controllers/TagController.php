<?php

namespace App\Http\Controllers;

use App\Models\Tag;
use Illuminate\Http\Request;

class TagController extends Controller
{
    public function index()
    {
        return response()->json(Tag::all());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|unique:tags,name',
            'color' => 'nullable|string'
        ]);

        return response()->json(Tag::create($request->all()));
    }

    public function update(Request $request, $id)
    {
        $tag = Tag::findOrFail($id);
        $request->validate([
            'name' => 'required|string|unique:tags,name,' . $id,
            'color' => 'nullable|string'
        ]);

        $tag->update($request->all());
        return response()->json($tag);
    }

    public function destroy($id)
    {
        $tag = Tag::findOrFail($id);
        // Desvincular de negocios (pivot table)
        $tag->businesses()->detach();
        $tag->delete();
        return response()->json(['success' => true]);
    }
}
