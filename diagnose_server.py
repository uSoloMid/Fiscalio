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
    
    # Check Docker Status
    docker_ps, _ = run_cmd(client, 'docker ps --format "{{.Names}}: {{.Status}}"')
    
    # Check Runner Logs (last 100 lines) - corrected name
    runner_logs, _ = run_cmd(client, 'docker logs --tail 100 fiscalio-runner')
    
    # Check Request Queue - Pending or Stuck - corrected container name 'sat-api-app'
    # Adding more status to see what's in the DB
    pending_req_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::whereIn(\'status\', [\'created\', \'polling\', \'downloading\'])->get());"'
    all_req_counts_cmd = 'docker exec sat-api-app php artisan tinker --execute="echo json_encode(App\Models\SatRequest::groupBy(\'status\')->selectRaw(\'status, count(*) as total\')->get());"'
    
    check_requests, _ = run_cmd(client, pending_req_cmd)
    counts, _ = run_cmd(client, all_req_counts_cmd)
    
    # Check Backups status
    backups_list, _ = run_cmd(client, 'ls -lh ~/Fiscalio/Base_datos/backups/')
    
    # Check Disk Space
    disk_space, _ = run_cmd(client, 'df -h /')
    
    # Check Agent logs (scraper_sat.js errors?) - corrected name
    agent_logs, _ = run_cmd(client, 'docker logs --tail 100 fiscalio-agent')

    result = {
        "docker_status": docker_ps.strip(),
        "runner_logs": runner_logs.strip(),
        "pending_requests_json": check_requests.strip(),
        "request_counts": counts.strip(),
        "backups": backups_list.strip(),
        "disk_space": disk_space.strip(),
        "agent_logs": agent_logs.strip()
    }

    with os.fdopen(os.open("c:/Fiscalio/diagnostics.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC), 'w') as f:
        f.write(json.dumps(result, indent=2))

    print("Diagnostics saved to c:/Fiscalio/diagnostics.json")
    client.close()
except Exception as e:
    import traceback
    error_msg = f"Error during diagnostics: {str(e)}\n{traceback.format_exc()}"
    print(error_msg)
    with open("c:/Fiscalio/diagnostics_error.log", "w") as f:
        f.write(error_msg)
