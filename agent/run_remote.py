import paramiko
import sys

def run(cmd):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    # Read output line by line to avoid blocking
    for line in stdout:
        print(line.strip())
    
    for line in stderr:
        print("ERR:", line.strip())
        
    ssh.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run(sys.argv[1])
    else:
        print("No command provided")
