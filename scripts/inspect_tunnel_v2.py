import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')

stdin, stdout, stderr = ssh.exec_command('docker inspect fiscalio-tunnel')
data = json.loads(stdout.read().decode())
if data:
    print("Args:", data[0].get('Args', []))
    print("Env:", data[0].get('Config', {}).get('Env', []))

ssh.close()
