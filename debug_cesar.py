import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    # 1. Find RFC for CESAR GARCIA
    q = "echo DB::table('businesses')->where('legal_name', 'like', '%CESAR%GARCIA%')->value('rfc');"
    rfc = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{q}"').strip()
    print(f"RFC found: {rfc}")

    # 2. Check for recent errors in logs
    print("\nRecent Error Logs:")
    errors = run_cmd(client, 'docker exec sat-api-app grep "Error in getSummary" storage/logs/laravel.log | tail -n 5')
    print(errors)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
