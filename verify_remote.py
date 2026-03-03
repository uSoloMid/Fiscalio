import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    print("Checking for Log::error in controller:")
    out = run_cmd(client, "grep -n 'Log::error' ~/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php")
    print(out)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
