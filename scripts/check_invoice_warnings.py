import paramiko
import json

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')

    # UUID from user screenshot: 4A162F41-4CCA-48B4-8589-9FF314CAD757
    uuid = "4A162F41-4CCA-48B4-8589-9FF314CAD757"
    
    print(f"Checking data for UUID: {uuid}")
    check_query = f"App\\Models\\Cfdi::where('uuid', '{uuid}')->first()"
    out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="echo json_encode({check_query});"')
    
    print("Database record:")
    print(out)
    
    # Check what evaluating it looks like (testing the controller logic via tinker)
    test_logic = f"""
    $c = App\\Models\\Cfdi::where('uuid', '{uuid}')->first();
    $controller = new App\\Http\\Controllers\\ProvisionalControlController();
    $method = new ReflectionMethod($controller, 'evaluateInvoiceWarnings');
    $method->setAccessible(true);
    echo json_encode($method->invoke($controller, $c));
    """
    print("\nEvaluating warnings via Controller logic:")
    out_eval = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{test_logic.replace('"', '\\"').replace('$', '\\$')}"')
    print(out_eval)

    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
