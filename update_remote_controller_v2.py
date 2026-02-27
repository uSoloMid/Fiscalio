import paramiko
import sys

def update_controller(host, user, password, content):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    # Upload to a temporary location first
    temp_path = '/tmp/BankStatementController.php'
    sftp = ssh.open_sftp()
    with sftp.file(temp_path, 'w') as f:
        f.write(content)
    sftp.close()
    
    # Move to final location using sudo
    final_path = '/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/BankStatementController.php'
    cmd = f'echo {password} | sudo -S mv {temp_path} {final_path}'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    err = stderr.read().decode()
    if err and 'password for' not in err:
        print(f"Error: {err}")
    else:
        print("File updated successfully with sudo")
    
    ssh.close()

host = '100.123.107.90'
user = 'fiscalio'
password = 'Solomid8'

content = r"""<?php

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
        // Accept RFC from body or query string
        $rfc = $request->input('rfc') ?? $request->query('rfc');

        // Save temporary file
        $tempPath = $file->storeAs('temp_banks', 'bank_' . time() . '.pdf');
        $absolutePath = storage_path('app/' . $tempPath);

        // Call python script
        $scriptPath = base_path('bank_parser/main.py');
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

        $rawOutput = implode("\n", $output);
        Log::info("Bank parser raw output: " . $rawOutput);
        
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
            Log::error("Failed to decode JSON from bank parser.");
            return response()->json([
                'error' => 'El procesador no devolvió un JSON válido para ' . $rfc,
                'raw' => $jsonResult,
                'details' => $output
            ], 500);
        }

        $transacciones = $data['transacciones'] ?? [];
        $summary = $data['summary'] ?? null;

        if (!$summary) {
            Log::warning("Summary missing from parser output, calculating manually...");
            
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
                $initialBalance = (float)($first['saldo'] ?? 0) - (float)($first['abono'] ?? 0) + (float)($first['cargo'] ?? 0);
                $finalBalance = (float)($last['saldo'] ?? 0);
            }

            $summary = [
                'initialBalance' => $initialBalance,
                'totalCargos' => $totalCargos,
                'totalAbonos' => $totalAbonos,
                'finalBalance' => $finalBalance
            ];
        }

        return response()->json([
            'success' => true,
            'banco' => strtoupper($data['banco'] ?? 'DESCONOCIDO'),
            'movements' => $transacciones,
            'summary' => $summary,
            'fileName' => $file->getClientOriginalName()
        ]);
    }

    public function confirm(Request $request)
    {
        // Accept RFC from body or query string
        $rfc = $request->input('rfc') ?? $request->query('rfc');
        
        // Merge it into the validation if missing
        if ($rfc && !$request->has('rfc')) {
            $request->merge(['rfc' => $rfc]);
        }

        $request->validate([
            'rfc' => 'required|string',
            'bank_name' => 'required|string',
            'file_name' => 'required|string',
            'movements' => 'required|array',
            'summary' => 'required|array'
        ]);

        try {
            DB::beginTransaction();

            $statement = BankStatement::create([
                'rfc_user' => $request->input('rfc'),
                'bank_name' => $request->input('bank_name'),
                'account_number' => $request->input('account_number') ?? 'N/A',
                'file_name' => $request->input('file_name'),
                'period_month' => now()->format('m'),
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
        $rfc = $request->input('rfc') ?? $request->query('rfc');
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
        $statement->delete();
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

update_controller(host, user, password, content)
