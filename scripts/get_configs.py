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
    
    # Get all container names and their compose config files
    out, _ = run_cmd(client, 'docker ps --format "{{.Names}} | {{.Label \\"com.docker.compose.project.config_files\\"}}"')
    
    result = {
        "containers_and_configs": out.strip()
    }

    with os.fdopen(os.open("c:/Fiscalio/container_configs.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC), 'w') as f:
        f.write(json.dumps(result, indent=2))

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
