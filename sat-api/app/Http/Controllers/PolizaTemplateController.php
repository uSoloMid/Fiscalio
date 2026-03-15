<?php

namespace App\Http\Controllers;

use App\Models\Business;
use App\Models\PolizaTemplate;
use Illuminate\Http\Request;

class PolizaTemplateController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $templates = PolizaTemplate::where('business_id', $business->id)
            ->with('lines.account:id,internal_code,name')
            ->orderBy('name')
            ->get();

        return response()->json($templates);
    }

    public function store(Request $request)
    {
        $request->validate([
            'rfc'                      => 'required|string',
            'name'                     => 'required|string|max:100',
            'tipo_poliza'              => 'required|integer|in:1,2,3',
            'concepto_template'        => 'nullable|string|max:200',
            'trigger_type'             => 'required|string|in:cfdi,movement',
            'cfdi_tipo'                => 'nullable|string',
            'cfdi_role'                => 'nullable|string|in:emisor,receptor',
            'movement_direction'       => 'nullable|string|in:cargo,abono',
            'lines'                    => 'required|array|min:1',
            'lines.*.sort_order'       => 'required|integer',
            'lines.*.tipo_movto'       => 'required|integer|in:0,1',
            'lines.*.account_source'   => 'required|string',
            'lines.*.account_id'       => 'nullable|integer|exists:accounts,id',
            'lines.*.importe_source'   => 'required|string',
            'lines.*.concepto_line'    => 'nullable|string|max:100',
            'lines.*.is_optional'      => 'boolean',
        ]);

        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $template = PolizaTemplate::create([
            'business_id'        => $business->id,
            'name'               => $request->name,
            'tipo_poliza'        => $request->tipo_poliza,
            'concepto_template'  => $request->concepto_template,
            'trigger_type'       => $request->trigger_type,
            'cfdi_tipo'          => $request->cfdi_tipo,
            'cfdi_role'          => $request->cfdi_role,
            'movement_direction' => $request->movement_direction,
        ]);

        foreach ($request->lines as $line) {
            $template->lines()->create([
                'sort_order'     => $line['sort_order'],
                'tipo_movto'     => $line['tipo_movto'],
                'account_source' => $line['account_source'],
                'account_id'     => $line['account_id'] ?? null,
                'importe_source' => $line['importe_source'],
                'concepto_line'  => $line['concepto_line'] ?? null,
                'is_optional'    => $line['is_optional'] ?? false,
            ]);
        }

        return response()->json($template->load('lines.account:id,internal_code,name'), 201);
    }

    public function update(Request $request, int $id)
    {
        $request->validate([
            'rfc'                      => 'required|string',
            'name'                     => 'sometimes|string|max:100',
            'tipo_poliza'              => 'sometimes|integer|in:1,2,3',
            'concepto_template'        => 'nullable|string|max:200',
            'trigger_type'             => 'sometimes|string|in:cfdi,movement',
            'cfdi_tipo'                => 'nullable|string',
            'cfdi_role'                => 'nullable|string|in:emisor,receptor',
            'movement_direction'       => 'nullable|string|in:cargo,abono',
            'lines'                    => 'sometimes|array|min:1',
            'lines.*.sort_order'       => 'required_with:lines|integer',
            'lines.*.tipo_movto'       => 'required_with:lines|integer|in:0,1',
            'lines.*.account_source'   => 'required_with:lines|string',
            'lines.*.account_id'       => 'nullable|integer|exists:accounts,id',
            'lines.*.importe_source'   => 'required_with:lines|string',
            'lines.*.concepto_line'    => 'nullable|string|max:100',
            'lines.*.is_optional'      => 'boolean',
        ]);

        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();
        $template = PolizaTemplate::where('business_id', $business->id)->findOrFail($id);

        $template->update($request->only([
            'name', 'tipo_poliza', 'concepto_template',
            'trigger_type', 'cfdi_tipo', 'cfdi_role', 'movement_direction',
        ]));

        if ($request->has('lines')) {
            $template->lines()->delete();
            foreach ($request->lines as $line) {
                $template->lines()->create([
                    'sort_order'     => $line['sort_order'],
                    'tipo_movto'     => $line['tipo_movto'],
                    'account_source' => $line['account_source'],
                    'account_id'     => $line['account_id'] ?? null,
                    'importe_source' => $line['importe_source'],
                    'concepto_line'  => $line['concepto_line'] ?? null,
                    'is_optional'    => $line['is_optional'] ?? false,
                ]);
            }
        }

        return response()->json($template->load('lines.account:id,internal_code,name'));
    }

    public function destroy(Request $request, int $id)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $template = PolizaTemplate::where('business_id', $business->id)->findOrFail($id);
        $template->lines()->delete();
        $template->delete();

        return response()->json(['success' => true]);
    }
}
