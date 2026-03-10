import paramiko, sys

sys.stdout.reconfigure(encoding='utf-8')

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='replace'), stderr.read().decode('utf-8', errors='replace')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=15)

print("=== SAT_DOCUMENTS para QIT ===")
out, _ = run_cmd(client, "docker exec fiscalio-db mysql -u root -pSolomid8 fiscalio_prod -e \"SELECT id, rfc, type, file_path, file_size, requested_at, created_at FROM sat_documents WHERE rfc LIKE '%QIT%' ORDER BY created_at DESC LIMIT 10;\"")
print(out or '(sin registros)')

print("\n=== LOGS AGENTE (últimas 80 líneas) ===")
out2, _ = run_cmd(client, 'docker logs fiscalio-agent --tail 80 2>&1')
print(out2[:5000])

print("\n=== LARAVEL LOG (últimas 50 líneas con QIT) ===")
out3, _ = run_cmd(client, "docker exec sat-api-app grep -i 'QIT' storage/logs/laravel.log | tail -30")
print(out3 or '(sin entradas)')

client.close()
