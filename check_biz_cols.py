import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    return out

try:
    print("Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=60, look_for_keys=False, allow_agent=False)
    print("Connected!")

    # Check columns of businesses table
    out = run_cmd(client, 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(Schema::getColumnListing(\'businesses\'));"')
    print(f"Columns: {out}")

    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
