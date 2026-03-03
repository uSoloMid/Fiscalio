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
    
    # Check what the API is seeing for ONE rfc specifically
    print("Testing Business Model directly...")
    test_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo App\\Models\\Business::first()?->rfc;"'
    run_cmd(client, test_cmd)

    # Check for any 'Business' vs 'business' case issues by listing tables
    print("Listing DB tables...")
    tables_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(DB::select(\"SELECT name FROM sqlite_master WHERE type=\'table\'\"));"'
    run_cmd(client, tables_cmd)

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
