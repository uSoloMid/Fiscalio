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

        // Resolve business
        $business = \App\Models\Business::where('rfc', $rfc)->first();
        if (!$business) {
            return response()->json(['error' => 'No se encontró la empresa con el RFC proporcionado'], 404);
        }

        // Save temporary file
        $tempPath = $file->storeAs('temp_banks', 'bank_' . time() . '.pdf');
        $absolutePath = storage_path('app/' . $tempPath);

        // Call python script - Detect OS
        $python = PHP_OS === 'WINNT' ? 'python' : 'python3';
        $scriptPath = base_path('bank_parser/main.py');
        $command = "$python " . escapeshellarg($scriptPath) . " " . escapeshellarg($absolutePath) . " 2>&1";

        Log::info("Executing bank parser: " . $command);

        exec($command, $output, $returnVar);
        $rawOutput = implode("\n", $output);
        Log::info("Bank parser raw output: " . $rawOutput);

        // Clean JSON output (find the first { and the last })
        $startPos = strpos($rawOutput, '{');
        $endPos = strrpos($rawOutput, '}');
        $data = null;

        if ($startPos !== false && $endPos !== false && $endPos > $startPos) {
            $jsonResult = substr($rawOutput, $startPos, $endPos - $startPos + 1);
            $data = json_decode($jsonResult, true);
        }

        // Error handling: if return code is not 0 OR data couldn't be decoded OR success is false
        if ($returnVar !== 0 || !$data || (isset($data['success']) && !$data['success'])) {
            $errorMessage = $data['error'] ?? 'Error desconocido al procesar el estado de cuenta';
            Log::error("Bank parser failed. Code: $returnVar. Error: $errorMessage. Output: $rawOutput");

            return response()->json([
                'error' => $errorMessage,
                'details' => $output,
                'raw' => $rawOutput
            ], 500);
        }

        // Translation layer: transacciones -> movements (To match UI and Migration)
        if (isset($data['transacciones']) && !isset($data['movements'])) {
            $data['movements'] = $data['transacciones'];
            unset($data['transacciones']);
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
        Log::info("Confirming bank statement for RFC: $rfc", $request->all());

        $business = \App\Models\Business::where('rfc', $rfc)->first();
        if (!$business) {
            Log::error("Business not found for RFC: $rfc");
            return response()->json(['error' => 'Empresa no encontrada'], 404);
        }

        try {
            DB::beginTransaction();

            $movements = $request->input('movements');
            $summary = $request->input('summary');

            // Prioritize period from parser
            $period = $summary['period'] ?? null;

            if (!$period && !empty($movements)) {
                $firstDate = $movements[0]['fecha'];
                if (strpos($firstDate, '/') !== false) {
                    $parts = explode('/', $firstDate);
                    $months = [
                        '01' => 'ENE',
                        '02' => 'FEB',
                        '03' => 'MAR',
                        '04' => 'ABR',
                        '05' => 'MAY',
                        '06' => 'JUN',
                        '07' => 'JUL',
                        '08' => 'AGO',
                        '09' => 'SEP',
                        '10' => 'OCT',
                        '11' => 'NOV',
                        '12' => 'DIC'
                    ];
                    $mIdx = $parts[1];
                    $period = ($months[$mIdx] ?? 'MES') . '-' . ($parts[2] ?? '2025');
                } elseif (strpos($firstDate, '-') !== false) {
                    // Handle YYYY-MM-DD
                    $parts = explode('-', $firstDate);
                    $months = [
                        '01' => 'ENE',
                        '02' => 'FEB',
                        '03' => 'MAR',
                        '04' => 'ABR',
                        '05' => 'MAY',
                        '06' => 'JUN',
                        '07' => 'JUL',
                        '08' => 'AGO',
                        '09' => 'SEP',
                        '10' => 'OCT',
                        '11' => 'NOV',
                        '12' => 'DIC'
                    ];
                    $mIdx = $parts[1];
                    $period = ($months[$mIdx] ?? 'MES') . '-' . ($parts[0] ?? '2025');
                }
            }

            if (!$period)
                $period = now()->format('M-Y');

            $statement = BankStatement::create([
                'business_id' => $business->id,
                'bank_name' => $request->input('bank_name'),
                'account_number' => $summary['account_number'] ?? $request->input('account_number') ?? 'PREDETERMINADA',
                'file_name' => $request->input('file_name'),
                'period' => $period,
                'initial_balance' => $summary['initialBalance'] ?? 0,
                'total_cargos' => $summary['totalCargos'] ?? 0,
                'total_abonos' => $summary['totalAbonos'] ?? 0,
                'final_balance' => $summary['finalBalance'] ?? 0,
            ]);

            foreach ($request->input('movements') as $m) {
                // Convert DD/MM/YYYY to YYYY-MM-DD for SQLite
                $date = $m['fecha'];
                if (strpos($date, '/') !== false) {
                    $parts = explode('/', $date);
                    if (count($parts) === 3) {
                        $date = "{$parts[2]}-{$parts[1]}-{$parts[0]}";
                    }
                }

                BankMovement::create([
                    'bank_statement_id' => $statement->id,
                    'date' => $date,
                    'description' => $m['concepto'] ?? 'Sin concepto',
                    'reference' => $m['referencia'] ?? null,
                    'cargo' => $m['cargo'] ?? 0,
                    'abono' => $m['abono'] ?? 0,
                    'saldo' => $m['saldo'] ?? 0,
                ]);
            }

            DB::commit();

            return response()->json(['success' => true, 'id' => $statement->id]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Error confirming bank statement: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function index(Request $request)
    {
        $rfc = $request->input('rfc');
        $business = \App\Models\Business::where('rfc', $rfc)->first();
        if (!$business)
            return response()->json([]);

        return BankStatement::where('business_id', $business->id)
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
