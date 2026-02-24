import paramiko
import time
import sys

def execute_remote(hostname, username, password, commands):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print(f"Connecting to {hostname}...")
        ssh.connect(hostname, username=username, password=password, timeout=10)
        
        for cmd in commands:
            print(f"> Running: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
            
            exit_status = stdout.channel.recv_exit_status()
            
            out = stdout.read().decode('utf-8', errors='ignore')
            err = stderr.read().decode('utf-8', errors='ignore')
            
            if out:
                print(out)
            if err:
                print(err, file=sys.stderr)
                
            if exit_status != 0:
                print(f"Command '{cmd}' failed with status {exit_status}", file=sys.stderr)
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    commands = [
        "cd ~/Fiscalio && docker exec api php artisan tinker --execute=\"\\App\\Models\\SatRequest::truncate();\"",
        "cd ~/Fiscalio && git pull origin main",
        "cd ~/Fiscalio && docker exec api php artisan optimize:clear",
        "cd ~/Fiscalio && docker compose restart"
    ]
    
    execute_remote("100.123.107.90", "fiscalio", "Solomid8", commands)
