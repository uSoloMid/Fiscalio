import paramiko
import json
import os

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    
    # Wait for the command to finish
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    print(f"Done: {cmd}")
    return out, err

try:
    print("Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=30, look_for_keys=False, allow_agent=False)
    print("Connected!")
    
    # Check directory listing
    ls_all, _ = run_cmd(client, 'ls -F ~/Fiscalio')
    
    # Check Docker compose version
    docker_v, _ = run_cmd(client, 'docker compose version')
    
    result = {
        "files_in_fiscalio": ls_all.strip(),
        "docker_compose_version": docker_v.strip()
    }

    with os.fdopen(os.open("c:/Fiscalio/server_files.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC), 'w') as f:
        f.write(json.dumps(result, indent=2))

    print("Server files saved to c:/Fiscalio/server_files.json")
    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
