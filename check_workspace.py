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
    print("Checking if any Workspace exists...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo App\\Models\\Workspace::first() ? \'SI\' : \'NO\';"')
    
    # List one business with all details
    print("Full detail of first business found:")
    detail_cmd = 'docker exec sat-api-app php artisan tinker --execute="print_r(App\\Models\\Business::first()?->toArray());"'
    run_cmd(client, detail_cmd)

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
