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
    
    # Check what the API is seeing (first 5 businesses)
    # Using more explicit tinker command to avoid "skipping untrusted" issues if possible
    # Actually that's a warning, not failure.
    print("Listing business RFCs from DB...")
    list_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\\Models\\Business::select(\'rfc\', \'legal_name\')->take(5)->get());"'
    run_cmd(client, list_cmd)

    # Check for logs related to 401/403 or authentication errors in laravel.log
    print("Checking recently added lines in laravel.log...")
    log_cmd = 'docker exec sat-api-app tail -n 50 storage/logs/laravel.log'
    run_cmd(client, log_cmd)
    
    # Check if we messed up CORS or something by looking at headers/config
    print("Checking CORS configuration...")
    cors_cmd = 'cat ~/Fiscalio/sat-api/config/cors.php'
    run_cmd(client, cors_cmd)

    client.close()
except Exception as e:
    import traceback
    print(f"Error during check: {str(e)}\n{traceback.format_exc()}")
