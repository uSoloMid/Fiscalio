import paramiko
import sys

def remote_exec(command):
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        print(f"Executing: {command}")
        stdin, stdout, stderr = ssh.exec_command(command)
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out: print(f"OUT:\n{out}")
        if err: print(f"ERR:\n{err}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        remote_exec(sys.argv[1])
    else:
        print("Usage: python remote_exec.py <command>")
