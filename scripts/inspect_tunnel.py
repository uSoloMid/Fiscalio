import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')

stdin, stdout, stderr = ssh.exec_command('docker inspect fiscalio-tunnel')
import json
data = json.loads(stdout.read().decode())
if data:
    print(json.dumps(data[0].get('Mounts', []), indent=4))
    print("\n--- Network ---")
    print(json.dumps(data[0].get('NetworkSettings', {}).get('Networks', {}), indent=4))

ssh.close()
