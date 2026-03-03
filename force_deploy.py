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
    
    # 1. FORCE PERMISSIONS
    print("Fixing permissions for git pull...")
    run_cmd(client, 'echo "Solomid8" | sudo -S chown -R fiscalio:fiscalio /home/fiscalio/Fiscalio')
    
    # 2. FORCE GIT UPDATE ON DEV BRANCH (AS USER IS WORKING ON DEV)
    print("Resetting and pulling latest dev...")
    # NOTE: Using 'git reset --hard' to clear any local server changes blocking the pull
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin && git checkout dev && git reset --hard origin/dev')
    
    # 3. RESTART RUNNER
    # Since we don't find a compose file for it, we restart by name
    print("Restarting fiscalio-runner...")
    run_cmd(client, 'docker restart fiscalio-runner')

    # 4. DATABASE CLEANUP - Fail stuck requests
    print("Cleaning up database (fail cert errors)...")
    bad_rfcs = ['GASS580112NS7', 'SOGA85030527A', 'YESJ050714M59', 'MABY8603306K1', 'PAVF770307DJ8']
    rfcs_str = ",".join(f"\'{r}\'" for r in bad_rfcs)
    cleanup_cmd = f'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::whereIn(\'state\', [\'created\', \'polling\', \'downloading\'])->whereIn(\'rfc\', [{rfcs_str}])->update([\'state\' => \'failed\', \'last_error\' => \'Error de Credenciales Detectado\']));"'
    run_cmd(client, cleanup_cmd)
    
    # Reset other polling/downloading requests to created to re-pick them with new logic
    reset_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::whereIn(\'state\', [\'polling\', \'downloading\'])->update([\'state\' => \'created\', \'attempts\' => 0]));"'
    run_cmd(client, reset_cmd)

    print("Deployment successfully finished!")
    client.close()
except Exception as e:
    import traceback
    print(f"Error during final deployment: {str(e)}\n{traceback.format_exc()}")
