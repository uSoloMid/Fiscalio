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
    
    # 1. Check current branch and git status
    print("Checking git status...")
    run_cmd(client, 'cd ~/Fiscalio && git branch && git status')
    
    # 2. Check DB file exists and permissions
    print("Checking database file...")
    run_cmd(client, 'ls -la ~/Fiscalio/Base_datos/database.sqlite')
    
    # 3. Check Business count via Tinker
    print("Checking business count...")
    count_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo App\\Models\\Business::count();"'
    run_cmd(client, count_cmd)
    
    # 4. Check .env file content (specifically DB path)
    print("Checking .env file...")
    run_cmd(client, 'cat ~/Fiscalio/sat-api/.env | grep DB_')

    client.close()
except Exception as e:
    import traceback
    print(f"Error during emergency check: {str(e)}\n{traceback.format_exc()}")
