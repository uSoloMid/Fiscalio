import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    print("Reading lines 150-170 of the controller on the server:")
    out = run_cmd(client, 'sed -n "150,170p" /home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php')
    print(out)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
