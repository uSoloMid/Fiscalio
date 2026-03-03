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
    
    # Force a fresh deploy on main branch
    print("Forcing full deploy of main on server...")
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin && git checkout main && git reset --hard origin/main')
    
    # Check for composer/node changes and re-build if necessary (unlikely to need but just in case)
    # Re-run all optimizations
    print("Optimizing Laravel again...")
    run_cmd(client, 'docker exec sat-api-app php artisan clear-compiled')
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')
    run_cmd(client, 'docker exec sat-api-app php artisan config:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan route:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan view:cache')
    
    # Restart all again
    print("Final restart of services...")
    run_cmd(client, 'docker restart sat-api-app fiscalio-agent fiscalio-runner')

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
