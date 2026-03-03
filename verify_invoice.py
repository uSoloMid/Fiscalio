import paramiko

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='ignore')

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    # Check the actual values for the UUID 4A162F41-4CCA-48B4-8589-9FF314CAD757
    q = "App\\Models\\Cfdi::where('uuid', '4A162F41-4CCA-48B4-8589-9FF314CAD757')->select('uuid', 'forma_pago', 'concepto', 'total', 'uso_cfdi')->first()"
    out = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="echo json_encode({q});"')
    print(f"Record: {out}")
    
    # Check what the evaluateInvoiceWarnings method returns
    q_eval = """
    $c = App\\Models\\Cfdi::where('uuid', '4A162F41-4CCA-48B4-8589-9FF314CAD757')->first();
    $ctrl = new App\\Http\\Controllers\\ProvisionalControlController();
    $reflected = new ReflectionMethod($ctrl, 'evaluateInvoiceWarnings');
    $reflected->setAccessible(true);
    echo json_encode($reflected->invoke($ctrl, $c));
    """
    out_eval = run_cmd(client, f'docker exec sat-api-app php artisan tinker --execute="{q_eval.replace('"', '\\"').replace('$', '\\$')}"')
    print(f"Eval: {out_eval}")

    client.close()
except Exception as e:
    print(f"Error: {str(e)}")
