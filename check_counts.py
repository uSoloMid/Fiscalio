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
    
    # corrected container name 'sat-api-app' and column 'state'
    all_req_counts_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::groupBy(\'state\')->selectRaw(\'state, count(*) as total\')->get());"'
    
    counts, _ = run_cmd(client, all_req_counts_cmd)
    
    result = {
        "request_counts": counts.strip(),
    }

    with os.fdopen(os.open("c:/Fiscalio/request_status.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC), 'w') as f:
        f.write(json.dumps(result, indent=2))

    print("Request status saved to c:/Fiscalio/request_status.json")
    client.close()
except Exception as e:
    import traceback
    error_msg = f"Error during diagnostics: {str(e)}\n{traceback.format_exc()}"
    print(error_msg)
