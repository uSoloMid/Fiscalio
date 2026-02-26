import paramiko
import time

def run_ssh_command(ssh, command):
    print(f"Ejecutando: {command}")
    stdin, stdout, stderr = ssh.exec_command(command)
    
    # Wait for completion? Standard read() usually waits.
    # But read() might hang if the command produces infinite output without closing
    # We assume 'ls' and 'docker ps' are fast.
    
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    
    if out:
        print(f"-- SALIDA --\n{out}\n-- FIN SALIDA --")
    if err:
        print(f"-- ERROR --\n{err}\n-- FIN ERROR --")
    return out, err

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Conectando...")
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    print("Conectado.")
    
    # Lista de comandos para actualizar y desplegar
    commands = [
        # 1. Ir al directorio donde está el proyecto
        "cd /home/fiscalio/Fiscalio && git fetch origin dev",
        
         # 2. Resetear para asegurar que tenemos la última versión limpia
        "cd /home/fiscalio/Fiscalio && git reset --hard origin/dev",
        
        # 3. Traer los cambios
        "cd /home/fiscalio/Fiscalio && git pull origin dev",
        
        # 4. Ejecutar comandos de Laravel DENTRO del contenedor 'api'
        # IMPORTANTE: Usamos el contenedor 'api' directamente
        "docker exec -i api php artisan optimize:clear",
        "docker exec -i api php artisan config:clear",
        "docker exec -i api php artisan route:clear",
        "docker exec -i api php artisan view:clear",
        
        # 5. Volver a optimizar para producción (opcional, pero recomendado)
        "docker exec -i api php artisan optimize"
    ]
    
    for cmd in commands:
        run_ssh_command(ssh, cmd)
        
except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
