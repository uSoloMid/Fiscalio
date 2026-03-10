import paramiko

def run_cmd(client, cmd):
    print(f"--- Running: {cmd} ---")
    stdin, stdout, stderr = client.exec_command(cmd)
    
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print("STDOUT:\n" + out)
    if err:
        print("STDERR:\n" + err)
    print("---------------------------------")

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=10)
    
    run_cmd(client, 'cd ~/Fiscalio && git pull origin main')
    run_cmd(client, 'cd ~/Fiscalio && docker exec api php artisan optimize:clear')
    run_cmd(client, 'cd ~/Fiscalio && docker restart api')
    run_cmd(client, 'cd ~/Fiscalio && docker exec api php artisan sat:run-jobs')

    client.close()
except Exception as e:
    print("Error:", e)
