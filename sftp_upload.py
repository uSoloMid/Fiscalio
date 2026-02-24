import paramiko
import os

try:
    print("Connecting to 192.168.100.97...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    print("Connected.")

    sftp = ssh.open_sftp()
    
    local_path = r'c:\Fiscalio\sat-api\app\Http\Controllers\ProvisionalControlController.php'
    remote_path = '/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php'
    
    print(f"Uploading {local_path} to {remote_path}...")
    sftp.put(local_path, remote_path)
    print("Upload successful.")
    
    sftp.close()
    
    print("Restarting 'api' container...")
    stdin, stdout, stderr = ssh.exec_command("docker restart api")
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    print("Clearing cache...")
    stdin, stdout, stderr = ssh.exec_command("docker exec api php artisan optimize:clear && docker exec api php artisan config:clear && docker exec api php artisan route:clear")
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    print("Optimizing...")
    stdin, stdout, stderr = ssh.exec_command("docker exec api php artisan optimize")
    print(stdout.read().decode())
    print(stderr.read().decode())

except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
