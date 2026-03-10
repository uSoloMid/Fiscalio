import paramiko

def check_docker_setup():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    # Check docker-compose or mounts
    command = "cd ~/Fiscalio && docker inspect api"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        print(f"Executing: {command}")
        stdin, stdout, stderr = ssh.exec_command(command)
        print(f"OUT:\n{stdout.read().decode()}")
        print(f"ERR:\n{stderr.read().decode()}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    check_docker_setup()
