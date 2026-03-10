import paramiko
import json

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode()

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=10)
    
    out = run_cmd(client, 'cd ~/Fiscalio && docker exec api php artisan tinker --execute="echo App\Models\SatRequest::where(\'created_at\', \'>=\', now()->subHours(2))->get()->toJson();"')

    with open("c:/Fiscalio/sat_requests_recent.json", "w", encoding="utf-8") as f:
        f.write(out)

    client.close()
except Exception as e:
    print("Error:", e)
