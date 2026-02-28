<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class DebugController extends Controller
{
    public function checkParser(Request $request)
    {
        $scriptPath = base_path('bank_parser/main.py');
        $python = PHP_OS === 'WINNT' ? 'python' : 'python3';

        $command = "$python $scriptPath --help 2>&1";
        exec($command, $output, $returnVar);

        $content = file_exists($scriptPath) ? file_get_contents($scriptPath) : 'FILE NOT FOUND';

        return response()->json([
            'script_exists' => file_exists($scriptPath),
            'command' => $command,
            'return_var' => $returnVar,
            'output' => $output,
            'python_version' => exec("$python --version 2>&1"),
            'first_lines' => substr($content, 0, 500)
        ]);
    }

    public function updateDev()
    {
        $commands = [
            'git fetch origin dev',
            'git reset --hard origin/dev',
            'chmod +x bank_parser/main.py'
        ];

        $results = [];
        foreach ($commands as $cmd) {
            exec("cd " . base_path() . " && $cmd 2>&1", $out, $ret);
            $results[$cmd] = ['output' => $out, 'ret' => $ret];
            $out = [];
        }

        return response()->json($results);
    }
}
