import paramiko

def run_cmd(ssh, cmd):
    print(f"Exec: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(f"OUT:\n{out}")
    if err: print(f"ERR:\n{err}")

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting to 192.168.100.97...")
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    print("Connected!")

    # Check last commit
    print("\n--- LAST COMMIT IN ~/Fiscalio ---")
    run_cmd(ssh, "cd /home/fiscalio/Fiscalio && git log -1")

    # Check status (to see if my SFTP upload created a modification)
    print("\n--- GIT STATUS ---")
    run_cmd(ssh, "cd /home/fiscalio/Fiscalio && git status")

except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
