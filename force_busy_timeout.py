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

    # Force busy_timeout to 60000ms 
    print("Setting busy_timeout to 60000...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="DB::statement(\'PRAGMA busy_timeout=60000;\');"')

    # Verify again
    print("Verifying busy_timeout again...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="print_r(DB::select(\'PRAGMA busy_timeout\'));"')

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
