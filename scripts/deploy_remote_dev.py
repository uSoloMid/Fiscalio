import paramiko
import sys

def run_ssh_commands(cmds):
    host = "100.123.107.90"
    user = "fiscalio"
    pw = "Solomid8"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(host, username=user, password=pw)
        for cmd in cmds:
            print(f"Ejecutando: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            out = stdout.read().decode()
            err = stderr.read().decode()
            if out: print(f"STDOUT:\n {out}")
            if err: print(f"STDERR:\n {err}")
            exit_status = stdout.channel.recv_exit_status()
            print(f"Exit code: {exit_status}\n")
        client.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    cmds = [
        "cd ~/Fiscalio && git pull origin dev",
        "docker restart sat-api-app"
    ]
    run_ssh_commands(cmds)
