import paramiko
import sys
from datetime import datetime

def run_backup():
    host = '100.123.107.90'
    user = 'fiscalio'
    password = 'Solomid8'
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    db_source = '/home/fiscalio/Fiscalio/Base_datos/database.sqlite'
    db_dest = f'/home/fiscalio/Fiscalio/backups/database_backup_{timestamp}.sqlite'
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=user, password=password)
        
        # Ensure backup dir exists
        ssh.exec_command('mkdir -p /home/fiscalio/Fiscalio/backups')
        
        # Perform copy
        print(f"Respaldando {db_source} en {db_dest}...")
        cmd = f'cp {db_source} {db_dest}'
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        err = stderr.read().decode()
        if err:
            print(f"Error: {err}")
        else:
            print(f"Respaldo completado exitosamente: {db_dest}")
            
    except Exception as e:
        print(f"Excepción: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    run_backup()
