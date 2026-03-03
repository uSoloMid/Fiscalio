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
    
    # Re-run all migrations on main just in case
    print("Running artisan migrate on server...")
    run_cmd(client, 'docker exec sat-api-app php artisan migrate --force')
    
    # Restart ALL services just in case one is in a weird state
    print("Restarting ALL containers...")
    run_cmd(client, 'docker restart sat-api-app fiscalio-agent fiscalio-runner fiscalio-tunnel')

    # Clear caches again
    print("Clearing Laravel caches...")
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
