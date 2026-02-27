import paramiko

def run_cmd(client, cmd):
    print(f"--- Running: {cmd} ---")
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode()

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=10)
    
    out = run_cmd(client, "cd ~/Fiscalio && docker logs api | tail -n 100")
    print(out)

    client.close()
except Exception as e:
    print("Error:", e)
