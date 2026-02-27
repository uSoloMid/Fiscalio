import paramiko
import sys

def write_remote_file(host, user, password, remote_path, content):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    # Use sftp for reliable file transfer
    sftp = ssh.open_sftp()
    with sftp.file(remote_path, 'w') as f:
        f.write(content)
    sftp.close()
    ssh.close()

host = '100.123.107.90'
user = 'fiscalio'
password = 'Solomid8'
remote_path = '/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/BankStatementController.php'

content = """<?php

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
        $scriptPath = base_path('bank_parser/main.py');
        $command = "python3 " . escapeshellarg($scriptPath) . " " . escapeshellarg($absolutePath) . " 2>&1";

        Log::info("Executing bank parser: " . $command);

        exec($command, $output, $returnVar);

        if ($returnVar !== 0) {
            Log::error("Bank parser failed with code $returnVar. Output: " . implode("\\\\n", $output));
            return response()->json([
                'error' => 'Error al procesar el estado de cuenta',
                'details' => $output
            ], 500);
        }

        $rawOutput = implode("\\\\n", $output);
        Log::info("Bank parser raw output: " . $rawOutput);
        
        // Intentar encontrar el inicio y fin del JSON si hay basura
        $startPos = strpos($rawOutput, '{');
        $endPos = strrpos($rawOutput, '}');
        
        $jsonResult = null;
        if ($startPos !== false && $endPos !== false && $endPos > $startPos) {
            $jsonResult = substr($rawOutput, $startPos, $endPos - $startPos + 1);
            $data = json_decode($jsonResult, true);
        } else {
            $data = null;
        }

        if (!$data) {
            Log::error("Failed to decode JSON from bank parser. Cleaned output: " . ($jsonResult ?? 'N/A'));
            return response()->json([
                'error' => 'El procesador no devolvió un JSON válido para ' . $rfc,
                'raw' => $jsonResult,
                'details' => $output
            ], 500);
        }

        // Calcular resumen para el frontend
        $transacciones = $data['transacciones'] ?? [];
        
        if (empty($transacciones)) {
            Log::warning("No transactions extracted for RFC $rfc");
        }

        $totalCargos = 0;
        $totalAbonos = 0;
        
        foreach ($transacciones as $t) {
            $totalCargos += (float)($t['cargo'] ?? 0);
            $totalAbonos += (float)($t['abono'] ?? 0);
        }

        $initialBalance = 0;
        $finalBalance = 0;

        if (count($transacciones) > 0) {
            $first = $transacciones[0];
            $last = end($transacciones);
            // Saldo inicial = Saldo de la primera transaccion - abono + cargo
            $initialBalance = (float)($first['saldo'] ?? 0) - (float)($first['abono'] ?? 0) + (float)($first['cargo'] ?? 0);
            $finalBalance = (float)($last['saldo'] ?? 0);
        }

        $response = [
            'success' => true,
            'banco' => strtoupper($data['banco'] ?? 'DESCONOCIDO'),
            'movements' => $transacciones,
            'summary' => [
                'initialBalance' => $initialBalance,
                'totalCargos' => $totalCargos,
                'totalAbonos' => $totalAbonos,
                'finalBalance' => $finalBalance
            ],
            'fileName' => $file->getClientOriginalName()
        ];

        return response()->json($response);
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
"""

write_remote_file(host, user, password, remote_path, content)
print("File updated successfully on Mini PC")
