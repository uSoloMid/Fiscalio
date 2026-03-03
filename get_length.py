import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    rfc_q = "App\\Models\\Cfdi::where('rfc_receptor', '!=', '')->value('rfc_receptor')"
    rfc = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="echo {rfc_q};"').strip()
    
    if rfc:
        test_q = f"""
        \$request = new \\Illuminate\\Http\\Request(['rfc' => '{rfc}', 'year' => 2026, 'month' => 2]);
        \$ctrl = new \\App\\Http\\Controllers\\ProvisionalControlController();
        echo strlen(\$ctrl->getSummary(\$request)->getContent());
        """
        out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{test_q}"')
        print(f"Content Length: {out.strip()}")
        
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
