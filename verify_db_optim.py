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
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=30, look_for_keys=False, allow_agent=False)
    print("Connected!")

    # Check if WAL is still active after restarts
    print("Checking journal_mode...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo DB::select(\'PRAGMA journal_mode\')[0]->journal_mode;"')
    
    # Enable WAL mode explicitly again just in case restart set it back (though it should be persistent in the file)
    print("Enabling WAL mode...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="DB::statement(\'PRAGMA journal_mode=WAL;\');"')

    # Check Busy Timeout
    print("Checking busy_timeout...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo DB::select(\'PRAGMA busy_timeout\')[0]->busy_timeout;"')

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
 Maroon
