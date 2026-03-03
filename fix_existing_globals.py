import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    return out, err

try:
    print("Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=60, look_for_keys=False, allow_agent=False)
    print("Connected!")

    # Script to update fecha_fiscal for global invoices
    php_code = """
$count = 0;
App\\Models\\Cfdi::whereNotNull('global_meses')->whereNotNull('global_year')->chunk(100, function($cfdis) use (&$count) {
    foreach ($cfdis as $cfdi) {
        $mesMapeado = (int)$cfdi->global_meses;
        if ($mesMapeado >= 13 && $mesMapeado <= 18) {
            $mesMapeado = (($mesMapeado - 13) * 2) + 1;
        } elseif ($mesMapeado > 12) {
            $mesMapeado = (int)$cfdi->fecha->format('m');
        }
        
        try {
            $newFecha = $cfdi->fecha->setDate($cfdi->global_year, $mesMapeado, 1)->setTime(0, 0, 0);
            if ($cfdi->fecha_fiscal->format('Y-m-d') !== $newFecha->format('Y-m-d')) {
                $cfdi->update(['fecha_fiscal' => $newFecha]);
                $count++;
            }
        } catch (\\Exception $e) {}
    }
});
echo "Updated $count global invoices.";
"""
    print("Updating existing global invoices on server...")
    out, err = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{php_code.replace('"', '\\"').replace('$', '\\$')}"')
    print(f"Output: {out}")
    if err:
        print(f"Error: {err}")

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
