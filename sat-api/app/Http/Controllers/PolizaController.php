<?php

namespace App\Http\Controllers;

use App\Models\BankMovement;
use App\Models\BankAccountMap;
use App\Models\Business;
use App\Models\Cfdi;
use App\Models\Poliza;
use App\Models\PolizaTemplate;
use App\Models\RfcAccountMap;
use App\Services\PolizaExportService;
use App\Services\PolizaGeneratorService;
use App\Services\PolizaMissingAccountException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PolizaController extends Controller
{
    public function __construct(
        private PolizaGeneratorService $generator,
        private PolizaExportService    $exporter,
    ) {}

    // ── Listado de pólizas por empresa ────────────────────────────────────────
    public function index(Request $request)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $polizas = Poliza::where('business_id', $business->id)
            ->with(['template:id,name', 'lines.account:id,internal_code,name'])
            ->when($request->year,   fn($q) => $q->whereYear('fecha', $request->year))
            ->when($request->month,  fn($q) => $q->whereMonth('fecha', $request->month))
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->orderByDesc('fecha')
            ->orderByDesc('numero')
            ->paginate(50);

        return response()->json($polizas);
    }

    // ── Pre-check: verifica qué cuentas faltan antes de generar ──────────────
    public function preCheck(Request $request)
    {
        $request->validate([
            'rfc'          => 'required|string',
            'items'        => 'required|array',
            'items.*.movement_id' => 'nullable|integer',
            'items.*.cfdi_id'     => 'nullable|integer',
            'items.*.template_id' => 'required|integer',
        ]);

        $business    = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();
        $businessRfc = $business->rfc;

        $items = [];
        foreach ($request->items as $item) {
            $movement = isset($item['movement_id'])
                ? BankMovement::with(['statement.business', 'cfdis'])->find($item['movement_id'])
                : null;
            $cfdi     = isset($item['cfdi_id']) ? Cfdi::find($item['cfdi_id']) : null;
            $template = PolizaTemplate::with('lines')->findOrFail($item['template_id']);

            // Si el trigger es 'movement', tomar el CFDI del movimiento
            if (!$cfdi && $movement) {
                $cfdi = $movement->cfdis->first() ?? $movement->cfdi;
            }

            $items[] = compact('movement', 'cfdi', 'template');
        }

        $missing = $this->generator->checkMissingAccounts($items, $business->id, $businessRfc);

        return response()->json($missing);
    }

    // ── Generar pólizas (movimientos bancarios + plantilla) ───────────────────
    public function generate(Request $request)
    {
        $request->validate([
            'rfc'          => 'required|string',
            'items'        => 'required|array|min:1',
            'items.*.movement_id' => 'nullable|integer',
            'items.*.cfdi_id'     => 'nullable|integer',
            'items.*.template_id' => 'required|integer',
        ]);

        $business    = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();
        $businessRfc = $business->rfc;

        $generated = [];
        $errors    = [];

        foreach ($request->items as $item) {
            try {
                $template = PolizaTemplate::with('lines.account')->findOrFail($item['template_id']);
                $numero   = $this->generator->nextNumero($business->id, $template->tipo_poliza, now()->year);

                if (!empty($item['movement_id'])) {
                    $movement = BankMovement::with(['statement.business', 'cfdis.pagosPropios'])->findOrFail($item['movement_id']);
                    $poliza   = $this->generator->generateFromMovement($movement, $template, $numero);
                } else {
                    $cfdi   = Cfdi::findOrFail($item['cfdi_id']);
                    $poliza = $this->generator->generateFromCfdi($cfdi, $template, $numero, $business->id, $businessRfc);
                }

                $generated[] = $poliza->load('lines.account', 'template:id,name');
            } catch (PolizaMissingAccountException $e) {
                $errors[] = [
                    'item'    => $item,
                    'type'    => $e->type,
                    'rfc'     => $e->rfc,
                    'nombre'  => $e->nombre,
                    'message' => $e->getMessage(),
                ];
            } catch (\Throwable $e) {
                $errors[] = ['item' => $item, 'message' => $e->getMessage()];
            }
        }

        return response()->json(compact('generated', 'errors'));
    }

    // ── Exportar pólizas como TXT (descarga) ─────────────────────────────────
    public function export(Request $request)
    {
        $request->validate([
            'rfc'       => 'required|string',
            'poliza_ids' => 'required|array|min:1',
            'poliza_ids.*' => 'integer',
        ]);

        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $polizas = Poliza::where('business_id', $business->id)
            ->whereIn('id', $request->poliza_ids)
            ->with(['lines.account'])
            ->orderBy('fecha')
            ->orderBy('numero')
            ->get();

        $txt = $this->exporter->generate($polizas);

        // Marcar como exportadas
        Poliza::whereIn('id', $polizas->pluck('id'))->update([
            'status'      => 'exported',
            'exported_at' => now(),
        ]);

        $filename = 'polizas_' . now()->format('Ymd_His') . '.txt';

        return response($txt, 200, [
            'Content-Type'        => 'text/plain; charset=Windows-1252',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    // ── Eliminar póliza ───────────────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        $poliza = Poliza::where('business_id', $business->id)->findOrFail($id);
        $poliza->delete();

        return response()->json(['success' => true]);
    }

    // ── Mapeo RFC → cuenta ───────────────────────────────────────────────────
    public function getRfcMaps(Request $request)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        return response()->json(
            RfcAccountMap::where('business_id', $business->id)
                ->with('account:id,internal_code,name')
                ->orderBy('rfc')
                ->get()
        );
    }

    public function saveRfcMap(Request $request)
    {
        $request->validate([
            'rfc'        => 'required|string',
            'rfc_map'    => 'required|array',
            'rfc_map.rfc'       => 'required|string|max:20',
            'rfc_map.nombre'    => 'nullable|string',
            'rfc_map.account_id'=> 'required|integer|exists:accounts,id',
        ]);

        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();
        $data     = $request->rfc_map;

        $map = RfcAccountMap::updateOrCreate(
            ['business_id' => $business->id, 'rfc' => strtoupper($data['rfc'])],
            ['nombre' => $data['nombre'] ?? null, 'account_id' => $data['account_id']]
        );

        return response()->json($map->load('account:id,internal_code,name'));
    }

    // ── Mapeo banco → cuenta ─────────────────────────────────────────────────
    public function getBankMaps(Request $request)
    {
        $request->validate(['rfc' => 'required|string']);
        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();

        return response()->json(
            BankAccountMap::where('business_id', $business->id)
                ->with('account:id,internal_code,name')
                ->get()
        );
    }

    public function saveBankMap(Request $request)
    {
        $request->validate([
            'rfc'      => 'required|string',
            'bank_map' => 'required|array',
            'bank_map.bank_statement_id' => 'nullable|integer',
            'bank_map.bank_name'         => 'nullable|string',
            'bank_map.account_number'    => 'nullable|string',
            'bank_map.account_id'        => 'required|integer|exists:accounts,id',
        ]);

        $business = Business::where('rfc', strtoupper($request->rfc))->firstOrFail();
        $data     = $request->bank_map;

        // Buscar existente por statement_id o por banco+cuenta
        $existing = BankAccountMap::where('business_id', $business->id)
            ->when($data['bank_statement_id'] ?? null,
                fn($q, $sid) => $q->where('bank_statement_id', $sid),
                fn($q) => $q->where('bank_name', $data['bank_name'] ?? null)
                            ->where('account_number', $data['account_number'] ?? null)
            )->first();

        if ($existing) {
            $existing->update(['account_id' => $data['account_id']]);
            $map = $existing;
        } else {
            $map = BankAccountMap::create([
                'business_id'      => $business->id,
                'bank_statement_id'=> $data['bank_statement_id'] ?? null,
                'bank_name'        => $data['bank_name'] ?? null,
                'account_number'   => $data['account_number'] ?? null,
                'account_id'       => $data['account_id'],
            ]);
        }

        return response()->json($map->load('account:id,internal_code,name'));
    }
}
