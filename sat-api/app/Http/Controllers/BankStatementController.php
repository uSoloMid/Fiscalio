<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BankStatement;
use App\Models\BankMovement;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BankStatementController extends Controller
{
    public function process(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf',
            'rfc' => 'required|string'
        ]);

        $file = $request->file('file');
        $rfc = $request->input('rfc');

        // Save temporary file
        $tempPath = $file->storeAs('temp_banks', 'bank_' . time() . '.pdf');
        $absolutePath = storage_path('app/' . $tempPath);

        // Call python script
        // Note: On Mini PC, python3 is available. We need the path to the bank_parser/main.py
        $scriptPath = base_path('../bank_parser/main.py');
        $command = "python3 " . escapeshellarg($scriptPath) . " " . escapeshellarg($absolutePath) . " 2>&1";

        Log::info("Executing bank parser: " . $command);

        exec($command, $output, $returnVar);

        if ($returnVar !== 0) {
            Log::error("Bank parser failed with code $returnVar. Output: " . implode("\n", $output));
            return response()->json([
                'error' => 'Error al procesar el estado de cuenta',
                'details' => $output
            ], 500);
        }

        $jsonResult = implode("", $output);
        $data = json_decode($jsonResult, true);

        if (!$data) {
            return response()->json([
                'error' => 'El procesador no devolvió un JSON válido',
                'raw' => $jsonResult
            ], 500);
        }

        // Add file name for confirmation step
        $data['fileName'] = $file->getClientOriginalName();

        return response()->json($data);
    }

    public function confirm(Request $request)
    {
        $request->validate([
            'rfc' => 'required|string',
            'bank_name' => 'required|string',
            'account_number' => 'nullable|string',
            'file_name' => 'required|string',
            'movements' => 'required|array',
            'summary' => 'required|array'
        ]);

        $rfc = $request->input('rfc');

        try {
            DB::beginTransaction();

            $statement = BankStatement::create([
                'rfc_user' => $rfc,
                'bank_name' => $request->input('bank_name'),
                'account_number' => $request->input('account_number') ?? 'N/A',
                'file_name' => $request->input('file_name'),
                'period_month' => now()->format('m'), // Simplified
                'period_year' => now()->format('Y'),
                'initial_balance' => $request->input('summary')['initialBalance'] ?? 0,
                'total_cargos' => $request->input('summary')['totalCargos'] ?? 0,
                'total_abonos' => $request->input('summary')['totalAbonos'] ?? 0,
                'final_balance' => $request->input('summary')['finalBalance'] ?? 0,
            ]);

            foreach ($request->input('movements') as $m) {
                BankMovement::create([
                    'bank_statement_id' => $statement->id,
                    'fecha' => $m['fecha'],
                    'concepto' => $m['concepto'],
                    'referencia' => $m['referencia'] ?? null,
                    'cargo' => $m['cargo'] ?? 0,
                    'abono' => $m['abono'] ?? 0,
                    'saldo' => $m['saldo'] ?? 0,
                ]);
            }

            DB::commit();

            return response()->json(['success' => true, 'id' => $statement->id]);
        }
        catch (\Exception $e) {
            DB::rollBack();
            Log::error("Error confirming bank statement: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function index(Request $request)
    {
        $rfc = $request->input('rfc');
        return BankStatement::where('rfc_user', $rfc)
            ->withCount('movements')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    public function show($id)
    {
        return BankStatement::with('movements')->findOrFail($id);
    }

    public function destroy($id)
    {
        $statement = BankStatement::findOrFail($id);
        $statement->delete(); // Cascades to movements if set up in migration or model boot
        return response()->json(['success' => true]);
    }

    public function updateMovement(Request $request, $id)
    {
        $movement = BankMovement::findOrFail($id);
        $movement->update($request->only(['concepto', 'referencia', 'cfdi_id']));
        return $movement;
    }
}
