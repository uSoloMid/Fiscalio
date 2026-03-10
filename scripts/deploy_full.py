import paramiko

def deploy_fix():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    # Use 'sat-api-app' as the container name
    commands = [
        "cd ~/Fiscalio && git checkout dev",
        "cd ~/Fiscalio && git pull origin dev",
        "cd ~/Fiscalio/sat-api && docker compose up -d --build",
        "docker exec sat-api-app php artisan optimize:clear",
        "docker exec sat-api-app php artisan config:clear",
        "docker exec sat-api-app php artisan route:clear",
        "docker restart sat-api-app"
    ]
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        for command in commands:
            print(f"Executing: {command}")
            stdin, stdout, stderr = ssh.exec_command(command)
            print(f"OUT:\n{stdout.read().decode()}")
            print(f"ERR:\n{stderr.read().decode()}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    deploy_fix()
