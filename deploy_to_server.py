import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    
    # Wait for the command to finish
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    print(f"STDOUT: {out}")
    if err:
        print(f"STDERR: {err}")
    return out, err

try:
    print("Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=60, look_for_keys=False, allow_agent=False)
    print("Connected!")
    
    # Check current branch
    run_cmd(client, 'cd ~/Fiscalio && git branch')
    
    # Fix permissions if needed (sometimes .gitignore is owned by root? suspicious)
    # Using echo password | sudo -S for non-interactive sudo
    print("Fixing permissions...")
    run_cmd(client, 'echo "Solomid8" | sudo -S chown -R fiscalio:fiscalio ~/Fiscalio')
    
    # CLEAN UP LOCAL CHANGES ON SERVER
    print("Cleaning up local changes on server...")
    run_cmd(client, 'cd ~/Fiscalio && git reset --hard HEAD && git clean -fd')
    
    # Pull dev branch
    print("Pulling latest code...")
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin && git checkout dev && git pull origin dev')
    
    # Clear caches
    print("Clearing Laravel caches...")
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')
    
    # PERFORM DB CLEANUP
    print("Performing database cleanup for stuck requests...")
    # NOTE: Using 'state' instead of 'status'
    # 1. Fail specific RFCs with known cert errors
    bad_rfcs = ['GASS580112NS7', 'SOGA85030527A', 'YESJ050714M59', 'MABY8603306K1', 'PAVF770307DJ8']
    rfcs_str = ",".join(f"'{r}'" for r in bad_rfcs)
    cleanup_cmd = f'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::whereIn(\'state\', [\'created\', \'polling\', \'downloading\'])->whereIn(\'rfc\', [{rfcs_str}])->update([\'state\' => \'failed\', \'last_error\' => \'Error de Credenciales (Detectado en Auditoria Manual)\']));"'
    run_cmd(client, cleanup_cmd)
    
    # 2. Reset other polling/downloading requests to created to re-pick them with new logic
    reset_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::whereIn(\'state\', [\'polling\', \'downloading\'])->update([\'state\' => \'created\', \'attempts\' => 0]));"'
    run_cmd(client, reset_cmd)

    # RESTART RUNNER - Correct path
    print("Restarting runner...")
    run_cmd(client, 'cd ~/Fiscalio/sat-api && docker compose restart runner')

    print("Deployment and cleanup finished successfully!")
    client.close()
except Exception as e:
    import traceback
    print(f"Error during deployment: {str(e)}\n{traceback.format_exc()}")
