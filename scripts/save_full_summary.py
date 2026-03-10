import paramiko
import base64

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
        $request = new \\Illuminate\\Http\\Request(['rfc' => '{rfc}', 'year' => 2026, 'month' => 2]);
        $ctrl = new \\App\\Http\\Controllers\\ProvisionalControlController();
        $res = $ctrl->getSummary($request);
        echo base64_encode($res->getContent());
        """
        out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{test_q.replace('"', '\\"').replace('$', '\\$')}"')
        
        with open('debug_response.b64', 'w') as f:
            f.write(out.strip())
            
        decoded = base64.b64decode(out.strip()).decode('utf-8')
        with open('debug_response.json', 'w', encoding='utf-8') as f:
            f.write(decoded)
        print("Response saved to debug_response.json")
        
    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
