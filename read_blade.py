import paramiko

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip()

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    
    print("Revisando la vista Blade...")
    out = run_cmd(ssh, "cat /home/fiscalio/Fiscalio/sat-api/resources/views/reports/provisional_summary.blade.php")
    print(out)

except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
