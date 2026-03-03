import paramiko
import base64

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    # Read the controller file
    out = run_cmd(client, 'base64 ~/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php')
    
    with open('remote_controller.php', 'wb') as f:
        f.write(base64.b64decode(out.strip()))
        
    print("Remote controller saved to remote_controller.php")
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
