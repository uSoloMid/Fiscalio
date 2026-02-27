import paramiko
import json

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode()

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=10)
    
    out1 = run_cmd(client, 'cd ~/Fiscalio && docker exec api php artisan tinker --execute="echo json_encode(App\Models\Business::select(\'rfc\', \'is_syncing\', \'last_sync_at\', \'sync_status\')->get());"')
    
    out2 = run_cmd(client, 'cd ~/Fiscalio && docker exec api php artisan tinker --execute="echo json_encode(App\Models\SatRequest::where(\'created_at\', \'>=\', now()->subDay())->get());"')

    out3 = run_cmd(client, 'cd ~/Fiscalio && date')

    with open("c:/Fiscalio/output.json", "w") as f:
        f.write(json.dumps({"businesses": out1.strip(), "requests": out2.strip(), "date_on_server": out3.strip()}, indent=2))

    client.close()
except Exception as e:
    print("Error:", e)
