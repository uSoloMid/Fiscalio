import paramiko

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip()

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    
    # Ruta al archivo
    path = "~/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php"
    
    print("Verificando contenido actual en el servidor...")
    content = run_cmd(ssh, f"grep -n 'legal_name' {path}")
    print(f"Líneas con 'legal_name':\n{content}")
    
    old_code = run_cmd(ssh, f"grep -n '\$client->name' {path}")
    if old_code:
        print(f"¡ADVERTENCIA! Aún existe código antiguo:\n{old_code}")
    else:
        print("El código antiguo ($client->name) ha sido ELIMINADO.")

    print("\nVerificando commit actual:")
    commit = run_cmd(ssh, "cd ~/Fiscalio && git log -1 --format='%H %s'")
    print(f"Último commit: {commit}")

    # Limpieza profunda
    print("\nLimpiando caches...")
    run_cmd(ssh, "docker exec api php artisan optimize:clear")
    run_cmd(ssh, "docker exec api php artisan config:clear")
    run_cmd(ssh, "docker exec api php artisan route:clear")
    run_cmd(ssh, "docker exec api php artisan optimize")

    print("\nRevisando si hay procesos de PHP que necesiten reinicio (solo por si acaso)...")
    # Si es docker, un restart del contenedor asegura que no haya nada en RAM o opcache persistente
    run_cmd(ssh, "docker restart api")
    print("Contenedor 'api' reiniciado.")

except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
