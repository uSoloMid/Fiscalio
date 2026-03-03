import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    return out

try:
    print("Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=60, look_for_keys=False, allow_agent=False)
    print("Connected!")

    # 1. Run migrations
    print("Running migrations...")
    out = run_cmd(client, 'docker exec sat-api-app php artisan migrate --force')
    print(f"Migration: {out}")

    # 2. Populate regimen_fiscal
    php_code = """
$businesses = App\\Models\\Business::all();
foreach ($businesses as $b) {
    // Try to find the regime from issued CFDIs
    $cfdi = App\\Models\\Cfdi::where('rfc_emisor', $b->rfc)->latest('fecha')->first();
    if ($cfdi && !empty($cfdi->regimen_fiscal_emisor)) {
        $b->update(['regimen_fiscal' => $cfdi->regimen_fiscal_emisor]);
    } else {
        // Try from received CFDIs
        $cfdi = App\\Models\\Cfdi::where('rfc_receptor', $b->rfc)->latest('fecha')->first();
        if ($cfdi && !empty($cfdi->regimen_fiscal_receptor)) {
            $b->update(['regimen_fiscal' => $cfdi->regimen_fiscal_receptor]);
        }
    }
    
    // Determine persona type
    if (strlen($b->rfc) === 12) {
        $b->update(['tipo_persona' => 'M']);
    } elseif (strlen($b->rfc) === 13) {
        $b->update(['tipo_persona' => 'F']);
    }
}
echo "Populated regime for " . count($businesses) . " businesses.";
"""
    print("Populating regimes...")
    out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{php_code.replace('"', '\\"').replace('$', '\\$')}"')
    print(f"Populate: {out}")

    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
