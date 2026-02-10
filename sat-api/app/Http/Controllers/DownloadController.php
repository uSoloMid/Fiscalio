<?php

namespace App\Http\Controllers;

use App\Models\Cfdi;
use App\Services\SatStatusService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use ZipArchive;
use Carbon\Carbon;

class DownloadController extends Controller
{
    protected $statusService;

    public function __construct(SatStatusService $statusService)
    {
        $this->statusService = $statusService;
    }

    public function downloadXmlZip(Request $request)
    {
        $rfc = $request->query('rfc');
        $periods = $request->input('periods', []); // Array of {year, month}
        $types = $request->input('types', ['emitidas', 'recibidas']); // Array: ['emitidas', 'recibidas']

        if (!$rfc || empty($periods)) {
            return response()->json(['error' => 'RFC y periodos son requeridos'], 400);
        }

        $cfdis = [];
        foreach ($periods as $period) {
            $year = $period['year'];
            $month = $period['month'];

            $query = Cfdi::whereYear('fecha', $year)
                ->whereMonth('fecha', $month)
                ->where('es_cancelado', false);

            $query->where(function ($q) use ($rfc, $types) {
                $conditions = [];
                if (in_array('emitidas', $types)) {
                    $conditions[] = ['rfc_emisor', $rfc];
                }
                if (in_array('recibidas', $types)) {
                    $conditions[] = ['rfc_receptor', $rfc];
                }

                if (count($conditions) === 2) {
                    $q->where('rfc_emisor', $rfc)->orWhere('rfc_receptor', $rfc);
                }
                elseif (count($conditions) === 1) {
                    $q->where($conditions[0][0], $conditions[0][1]);
                }
                else {
                    // Si no hay tipos seleccionados, no traer nada (aunque validamos arriba)
                    $q->whereRaw('1=0');
                }
            });

            $items = $query->get();
            foreach ($items as $item) {
                $cfdis[] = $item;
            }
        }

        if (count($cfdis) === 0) {
            return response()->json(['error' => 'No se encontraron facturas para los criterios seleccionados'], 404);
        }

        // 1. Verificación masiva
        foreach ($cfdis as $cfdi) {
            $lastUpdate = $cfdi->estado_sat_updated_at ?Carbon::parse($cfdi->estado_sat_updated_at) : null;
            if (!$lastUpdate || $lastUpdate->diffInHours(now()) > 24) {
                $status = $this->statusService->checkStatus(
                    $cfdi->uuid,
                    $cfdi->rfc_emisor,
                    $cfdi->rfc_receptor,
                    (string)$cfdi->total
                );

                if ($status['estado'] !== 'Error') {
                    $cfdi->estado_sat = $status['estado'];
                    $cfdi->es_cancelado = ($status['estado'] === 'Cancelado');
                    $cfdi->es_cancelable = $status['es_cancelable'];
                    $cfdi->estatus_cancelacion = $status['estatus_cancelacion'];
                    $cfdi->validacion_efos = $status['validacion_efos'];
                    $cfdi->estado_sat_updated_at = now();
                    $cfdi->save();
                }
            }
        }

        // 2. Generar ZIP
        $zipName = "facturas_{$rfc}_" . now()->format('YmdHis') . ".zip";
        $zipPath = storage_path("app/public/temp/$zipName");

        if (!file_exists(dirname($zipPath))) {
            mkdir(dirname($zipPath), 0755, true);
        }

        $zip = new ZipArchive;
        if ($zip->open($zipPath, ZipArchive::CREATE) === TRUE) {
            foreach ($cfdis as $cfdi) {
                if ($cfdi->es_cancelado)
                    continue;

                if ($cfdi->path_xml && Storage::exists($cfdi->path_xml)) {
                    $xmlContent = Storage::get($cfdi->path_xml);

                    $statusStr = $cfdi->estado_sat ?: 'Vigente';
                    $comment = "\n<!-- Estatus SAT: {$statusStr} | Verificado el: " . now()->toDateTimeString() . " -->\n";
                    $xmlContent .= $comment;

                    $folder = ($cfdi->rfc_emisor === $rfc) ? 'emitidas' : 'recibidas';
                    $fileName = "{$cfdi->rfc_emisor}_{$cfdi->rfc_receptor}_{$cfdi->uuid}.xml";

                    // Solo usar carpetas si se seleccionaron ambos tipos o si queremos consistencia
                    $zip->addFromString("$folder/$fileName", $xmlContent);
                }
            }
            $zip->close();
        }
        else {
            return response()->json(['error' => 'No se pudo crear el archivo ZIP'], 500);
        }

        return response()->download($zipPath)->deleteFileAfterSend(true);
    }
}
