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
    
    # Check directory listing with -la
    ls_la, _ = run_cmd(client, 'ls -la ~/Fiscalio')
    
    # Check what containers belong to what projects? 
    # Use docker inspect on all containers to find their compose file
    container_ids, _ = run_cmd(client, 'docker ps -q')
    inspect_all, _ = run_cmd(client, f'docker inspect {container_ids.replace("\n", " ")} --format "{{.Name}}: {{index .Config.Labels \"com.docker.compose.project\"}} - {{index .Config.Labels \"com.docker.compose.service\"}} at {{index .Config.Labels \"com.docker.compose.project.config_files\"}}"')
    
    result = {
        "ls_la": ls_la.strip(),
        "inspect_all": inspect_all.strip()
    }

    with os.fdopen(os.open("c:/Fiscalio/server_full_check.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC), 'w') as f:
        f.write(json.dumps(result, indent=2))

    client.close()
except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
