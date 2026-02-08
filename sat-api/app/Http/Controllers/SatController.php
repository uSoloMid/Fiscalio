<?php

namespace App\Http\Controllers;

use App\Models\Cfdi;
use App\Models\SatRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SatController extends Controller
{
    public function indexCfdis(Request $request)
    {
        $query = Cfdi::query();

        // RFC User filtering
        if ($request->has('rfc_user')) {
            $rfcUser = strtoupper($request->input('rfc_user'));
            $tipo = $request->input('tipo'); // emitidas, recibidas, o null (todas)

            if ($tipo === 'emitidas') {
                $query->where('rfc_emisor', $rfcUser);
            }
            elseif ($tipo === 'recibidas') {
                $query->where('rfc_receptor', $rfcUser);
            }
            else {
                $query->where(function ($q) use ($rfcUser) {
                    $q->where('rfc_emisor', $rfcUser)
                        ->orWhere('rfc_receptor', $rfcUser);
                });
            }
        }

        // Specific RFC filters (if any)
        if ($request->has('rfc_emisor')) {
            $query->where('rfc_emisor', strtoupper($request->input('rfc_emisor')));
        }
        if ($request->has('rfc_receptor')) {
            $query->where('rfc_receptor', strtoupper($request->input('rfc_receptor')));
        }

        // Date filters
        if ($request->has('year')) {
            $query->whereYear('fecha', $request->input('year'));
        }
        if ($request->has('month')) {
            $query->whereMonth('fecha', $request->input('month'));
        }

        // Search (q)
        if ($request->has('q') && !empty($request->input('q'))) {
            $q = $request->input('q');
            $query->where(function ($sub) use ($q) {
                $sub->where('uuid', 'like', "%$q%")
                    ->orWhere('rfc_emisor', 'like', "%$q%")
                    ->orWhere('rfc_receptor', 'like', "%$q%")
                    ->orWhere('name_emisor', 'like', "%$q%")
                    ->orWhere('name_receptor', 'like', "%$q%")
                    ->orWhere('concepto', 'like', "%$q%");
            });
        }

        // CFDI Type filter (I, E, P, N, T)
        if ($request->has('cfdi_tipo') && !empty($request->input('cfdi_tipo'))) {
            $query->where('tipo', $request->input('cfdi_tipo'));
        }

        // Status filter
        if ($request->input('status') === 'cancelados') {
            $query->where('es_cancelado', true);
        }
        else {
            // "Todas", "Emitidas" y "Recibidas" solo muestran vigentes por defecto
            $query->where('es_cancelado', false);
        }

        $query->orderBy('fecha', 'desc');

        $perPage = $request->input('pageSize', 20);
        return response()->json($query->paginate($perPage));
    }


    public function refreshCfdiStatus($uuid, \App\Services\SatStatusService $service)
    {
        $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();

        $result = $service->checkStatus(
            $cfdi->uuid,
            $cfdi->rfc_emisor,
            $cfdi->rfc_receptor,
            number_format($cfdi->total, 2, '.', '')
        );

        if ($result['estado'] !== 'Error') {
            $cfdi->estado_sat = $result['estado'];
            $cfdi->estado_sat_updated_at = now();
            $cfdi->es_cancelado = ($result['estado'] === 'Cancelado' ? 1 : 0);
            $cfdi->es_cancelable = $result['es_cancelable'];
            $cfdi->estatus_cancelacion = $result['estatus_cancelacion'];
            $cfdi->validacion_efos = $result['validacion_efos'];
            $cfdi->save();
        }

        return response()->json([
            'metadata' => $cfdi,
            'sat_response' => $result
        ]);
    }

    public function showCfdi($uuid)
    {
        $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();

        return response()->json([
            'metadata' => $cfdi,
            'xml_url' => url("api/cfdis/$uuid/xml"), // Ruta para descargar
        ]);
    }

    public function downloadXml($uuid)
    {
        $cfdi = Cfdi::where('uuid', $uuid)->firstOrFail();

        if (!Storage::exists($cfdi->path_xml)) {
            return response()->json(['error' => 'Archivo no encontrado'], 404);
        }

        return Storage::download($cfdi->path_xml);
    }

    public function showRequest($id)
    {
        // Buscar por ID interno o RequestId del SAT
        $req = SatRequest::where('id', $id)->orWhere('request_id', $id)->firstOrFail();
        return response()->json($req);
    }
    public function getPeriods(Request $request)
    {
        $rfcUser = $request->input('rfc_user');
        if (!$rfcUser) {
            return response()->json([]);
        }

        // SQLite syntax for YYYY-MM. 
        // For MySQL use DATE_FORMAT(fecha, '%Y-%m')
        $periods = Cfdi::selectRaw('substr(fecha, 1, 7) as period')
            ->where(function ($q) use ($rfcUser) {
            $q->where('rfc_emisor', $rfcUser)
                ->orWhere('rfc_receptor', $rfcUser);
        })
            ->groupBy('period')
            ->orderBy('period', 'desc')
            ->pluck('period');

        return response()->json($periods);
    }
    public function startSync(Request $request, \App\Services\BusinessSyncService $service)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json(['error' => 'RFC required'], 400);

        $business = \App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail();
        $result = $service->syncIfNeeded($business);

        return response()->json($result);
    }

    public function verifyStatus(Request $request, \App\Services\BusinessSyncService $service)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json(['error' => 'RFC required'], 400);

        $business = \App\Models\Business::where('rfc', strtoupper($rfc))->firstOrFail();
        $result = $service->verifyInvoices($business, $request->all());

        return response()->json($result);
    }

    public function getActiveRequests(Request $request)
    {
        $rfc = $request->input('rfc');
        if (!$rfc)
            return response()->json([]);

        $requests = SatRequest::where('rfc', strtoupper($rfc))
            ->orderBy('created_at', 'desc')
            ->limit(5)
            ->get();

        return response()->json($requests);
    }
}
