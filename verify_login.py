import paramiko

def verify_login_logic():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    # Check if a user with email '1' and password '1' can authenticate in Tinker
    code = r"echo Auth::attempt(['email' => '1', 'password' => '1']) ? 'OK' : 'FAIL';"
    command = f'cd ~/Fiscalio && docker exec sat-api-app php artisan tinker --execute="{code}"'
    
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
    verify_login_logic()
