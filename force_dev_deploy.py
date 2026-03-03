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
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=30, look_for_keys=False, allow_agent=False)
    print("Connected!")
    
    # Force a fresh deploy on dev branch
    print("Forcing full deploy of DEV branch on server...")
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin && git checkout dev && git reset --hard origin/dev')
    
    # Re-run optimizations
    print("Optimizing Laravel...")
    run_cmd(client, 'docker exec sat-api-app php artisan clear-compiled')
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')
    run_cmd(client, 'docker exec sat-api-app php artisan config:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan route:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan view:cache')
    
    # Restart services
    print("Final restart of services...")
    run_cmd(client, 'docker restart sat-api-app fiscalio-agent fiscalio-runner')

    client.close()
    print("Deploy to DEV completed!")
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
