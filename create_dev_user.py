import paramiko

def create_dev_user():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    # Using bcrypt and avoiding complex escaping
    php_code = "$user=App\\Models\\User::updateOrCreate(['email'=>'1'],['name'=>'Dev User','password'=>bcrypt('1')]);echo 'CREATED:'.$user->email;"
    
    # We use single quotes for the bash command to avoid interpolation
    command = f'docker exec api php artisan tinker --execute="{php_code}"'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        print(f"Executing: {command}")
        stdin, stdout, stderr = ssh.exec_command(command)
        out = stdout.read().decode()
        err = stderr.read().decode()
        print(f"OUT: {out}")
        print(f"ERR: {err}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    create_dev_user()
