import paramiko
import os

def upload_file(client, local_path, remote_path):
    print(f"Uploading {local_path} to {remote_path}...")
    sftp = client.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()
    print("Upload complete!")

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    # Path to the controller
    local_ctrl = r'c:\Fiscalio\sat-api\app\Http\Controllers\ProvisionalControlController.php'
    remote_ctrl = '/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php'
    
    upload_file(client, local_ctrl, remote_ctrl)
    
    # Path to the UI file (just in case they use the Mini PC for UI too, though unlikely)
    local_ui = r'c:\Fiscalio\ui\src\pages\ProvisionalControlPage.tsx'
    remote_ui = '/home/fiscalio/Fiscalio/ui/src/pages/ProvisionalControlPage.tsx'
    
    # Ensure directory exists for UI (just in case)
    client.exec_command('mkdir -p /home/fiscalio/Fiscalio/ui/src/pages/')
    upload_file(client, local_ui, remote_ui)
    
    # Optimizations
    print("Optimizing Laravel...")
    client.exec_command('docker exec sat-api-app php artisan optimize:clear')
    client.exec_command('docker exec sat-api-app php artisan config:cache')
    client.exec_command('docker exec sat-api-app php artisan route:cache')
    
    # Restart
    print("Restarting containers...")
    client.exec_command('docker restart sat-api-app')

    client.close()
    print("Force upload and restart complete!")
except Exception as e:
    print(f"Error: {str(e)}")
