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
    
    # Check if we shifted to another workspace or similar that could hide businesses
    print("Checking workspaces table...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo App\\Models\\Workspace::count();"')
    
    # Check if there is a 'deleted_at' column in businesses or if they were filtered?
    print("Checking first 3 businesses raw data...")
    raw_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(DB::table(\'businesses\')->take(3)->get());"'
    run_cmd(client, raw_cmd)

    # Check for logs AGAIN, specifically around the moment of checkout to main
    print("Checking laravel.log for errors in the last 10 minutes...")
    log_cmd = 'docker exec sat-api-app tail -n 200 storage/logs/laravel.log'
    run_cmd(client, log_cmd)

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
