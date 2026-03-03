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
    print("Fixing permissions for git operations...")
    run_cmd(client, 'echo "Solomid8" | sudo -S chown -R fiscalio:fiscalio /home/fiscalio/Fiscalio')
    
    # 2. UPDATE MAIN BRANCH ON SERVER
    print("Updating production (main branch) on server...")
    # NOTE: Fetching and resetting main to origin/main (which we just pushed)
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin && git checkout main && git reset --hard origin/main')
    
    # 3. RESTART SERVICES (now on main)
    # The README says main is what runs permanently.
    # Note: Using 'docker restart' as we found the service names.
    print("Restarting fiscalio-runner...")
    run_cmd(client, 'docker restart fiscalio-runner')
    
    # 4. LARAVEL HOUSEKEEPING (on the app container)
    print("Clearing Laravel caches...")
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')

    print("Main branch deployment successful!")
    client.close()
except Exception as e:
    import traceback
    print(f"Error during main deployment: {str(e)}\n{traceback.format_exc()}")
