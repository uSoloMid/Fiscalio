import paramiko

def run_cmd(ssh, cmd):
    print(f"Exec: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('192.168.100.97', username='fiscalio', password='Solomid8')
    
    path = "/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php"
    
    print("--- LEYENDO LINEAS 485-525 ---")
    out, err = run_cmd(ssh, f"sed -n '485,525p' {path}")
    print(out)
    
    print("\n--- VERIFICANDO DOCKER MOUNT ---")
    out, err = run_cmd(ssh, "docker inspect api --format '{{ range .Mounts }}{{ .Source }} -> {{ .Destination }}{{ \"\\n\" }}{{ end }}'")
    print(out)

except Exception as e:
    print(f"Error: {e}")
finally:
    ssh.close()
