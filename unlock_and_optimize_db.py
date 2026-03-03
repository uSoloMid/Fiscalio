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

    # 1. Check for -wal and -shm files
    print("Checking for WAL/SHM files...")
    run_cmd(client, 'ls -la /home/fiscalio/Fiscalio/Base_datos/database.sqlite*')

    # 2. EMERGENCY UNLOCK: Kill all processes accessing the DB
    print("Unlocking DB by killing owners...")
    run_cmd(client, 'echo "Solomid8" | sudo -S fuser -k /home/fiscalio/Fiscalio/Base_datos/database.sqlite')
    
    # 3. REBOOT DOCKER CONTAINERS
    print("Restarting containers...")
    run_cmd(client, 'docker restart sat-api-app fiscalio-runner')

    # 4. FIX .env TO ADD UNLOCK PARAMETER
    print("Checking if .env can be modified for WAL mode...")
    # Since it's SQLite, sometimes WAL mode is better for concurrency
    print("Setting WAL mode via Tinker...")
    run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="DB::statement(\'PRAGMA journal_mode=WAL;\');"')

    client.close()
except Exception as e:
    import traceback
    print(f"Error during repair: {str(e)}\n{traceback.format_exc()}")
