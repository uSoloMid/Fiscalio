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
    
    # Check if there are migrations pending on main branch
    print("Checking migrations status...")
    migration_cmd = 'docker exec sat-api-app php artisan migrate:status'
    run_cmd(client, migration_cmd)
    
    # Check if we should re-install dependencies if anything changed in composer.json
    # Usually we don't do this automatically if not needed, but check it.
    print("Checking for vendor folder...")
    run_cmd(client, 'ls -ld ~/Fiscalio/sat-api/vendor')

    # Check the actual database schema for 'businesses' table
    print("Checking businesses table structure...")
    schema_cmd = 'sqlite3 ~/Fiscalio/Base_datos/database.sqlite ".schema businesses"'
    run_cmd(client, schema_cmd)

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\n{traceback.format_exc()}")
