import paramiko, time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.123.107.90', username='fiscalio', password='Solomid8',
               timeout=15, look_for_keys=False, allow_agent=False)

def run(cmd):
    _, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='replace')

print("Esperando autodeploy...")
time.sleep(70)

out = run("tail -5 /home/fiscalio/Fiscalio/autodeploy.log 2>/dev/null")
print(out)
client.close()
