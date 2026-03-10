import paramiko

def execute_remote_commands():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    commands = [
        "docker ps --format '{{.Names}}'",
        "docker restart fiscalio-api fiscalio-runner fiscalio-agent fiscalio-tunnel",
        "docker restart api runner agent tunnel"
    ]
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        for command in commands:
            print(f"Executing: {command}")
            stdin, stdout, stderr = ssh.exec_command(command)
            print(stdout.read().decode())
            print(stderr.read().decode())
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    execute_remote_commands()
