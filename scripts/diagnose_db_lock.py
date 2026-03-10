import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
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

    # 1. Check for locked SQLite database processes
    print("Checking for processes holding the database...")
    run_cmd(client, 'fuser /home/fiscalio/Fiscalio/Base_datos/database.sqlite')
    
    # 2. Check permissions on both the directory and the file
    print("Checking permissions...")
    run_cmd(client, 'ls -ld /home/fiscalio/Fiscalio/Base_datos')
    run_cmd(client, 'ls -la /home/fiscalio/Fiscalio/Base_datos/database.sqlite')
    
    # 3. List entries in Businesses via Tinker and check for DB errors in output
    print("Testing DB connectivity with Tinker...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo App\\Models\\Business::count();"')

    # 4. Check for log messages related to "database is locked" or "read-only"
    print("Checking laravel.log for DB intensity...")
    run_cmd(client, 'docker exec sat-api-app grep -i "database" storage/logs/laravel.log | tail -n 20')

    client.close()
except Exception as e:
    import traceback
    print(f"Error during diagnosis: {str(e)}\n{traceback.format_exc()}")
