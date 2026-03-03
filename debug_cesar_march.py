import paramiko
import base64

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    rfc = 'GAMC810409FG6' # Cesar Garcia
    test_q = f"""
    \$request = new \\Illuminate\\Http\\Request(['rfc' => '{rfc}', 'year' => 2026, 'month' => 3]);
    \$ctrl = new \\App\\Http\\Controllers\\ProvisionalControlController();
    \$res = \$ctrl->getSummary(\$request);
    echo base64_encode(\$res->getContent());
    """
    out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{test_q}"')
    
    decoded = base64.b64decode(out.strip()).decode('utf-8')
    print(f"API Response for {rfc} (March 2026):")
    print(decoded)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
