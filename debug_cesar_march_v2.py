import paramiko
import base64
import re

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
    echo "---START---" . base64_encode(\$res->getContent()) . "---END---";
    """
    out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{test_q}"')
    
    match = re.search(r'---START---(.*?)---END---', out, re.DOTALL)
    if match:
        b64_data = match.group(1).strip()
        decoded = base64.b64decode(b64_data).decode('utf-8')
        print(f"API Response for {rfc} (March 2026):")
        print(decoded)
    else:
        print("Could not find start/end markers in output:")
        print(out)
    
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
