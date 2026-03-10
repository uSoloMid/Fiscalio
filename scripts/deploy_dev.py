import paramiko

def deploy_to_dev():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    commands = [
        "cd ~/Fiscalio && git checkout dev",
        "cd ~/Fiscalio && git pull origin dev",
        "docker exec api php artisan migrate",
        "docker exec api php artisan optimize:clear",
        "docker restart api"
    ]
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        for command in commands:
            print(f"Executing: {command}")
            stdin, stdout, stderr = ssh.exec_command(command)
            out = stdout.read().decode()
            err = stderr.read().decode()
            if out: print(f"OUT: {out}")
            if err: print(f"ERR: {err}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    deploy_to_dev()
