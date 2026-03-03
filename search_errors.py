import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    print("Searching for 'Error in getSummary':")
    out = run_cmd(client, 'docker exec sat-api-app grep -i "Error in getSummary" storage/logs/laravel.log | tail -n 20')
    print(out)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
