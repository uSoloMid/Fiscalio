import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode() + "\nERR:" + stderr.read().decode()

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=10)
    
    code = """
$b = App\Models\Business::where('rfc', 'GAMC810409FG6')->first();
if ($b) {
    if ($b->is_syncing || ($b->last_sync_at && $b->last_sync_at > now()->subHours(11))) {
        echo 'Would block. is_syncing: ' . $b->is_syncing . ' | last_sync: ' . $b->last_sync_at . ' | now sub 11: ' . now()->subHours(11);
    } else {
        $service = app(App\Services\BusinessSyncService::class);
        $res = $service->syncIfNeeded($b);
        echo json_encode($res);
    }
} else {
    echo 'Business not found';
}
"""
    cmd = 'cd ~/Fiscalio && docker exec api php artisan tinker --execute="' + code.replace('"', '\\"') + '"'
    
    # We must escape $ variables if we pass via shell, or better pass it to a file
    
    # Let's just create a php script inside the container and run it
    
    client.exec_command("echo \"<?php require __DIR__.'/vendor/autoload.php'; \$app = require_once __DIR__.'/bootstrap/app.php'; \$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap(); \$b = App\Models\Business::where('rfc', 'GAMC810409FG6')->first(); if (\$b) { \$service = app('App\Services\BusinessSyncService'); echo json_encode(\$service->syncIfNeeded(\$b)); } else { echo 'No found'; }\" > ~/Fiscalio/sat-api/test_sync_b.php")

    out = run_cmd(client, 'cd ~/Fiscalio && docker exec api php test_sync_b.php')
    print("RES:", out)
    
    client.close()
except Exception as e:
    print(e)
