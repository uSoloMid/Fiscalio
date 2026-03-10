import paramiko

def run_cmd(client, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    print(f"STDOUT: {out}")
    if err:
        print(f"STDERR: {err}")
    return out, err

try:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    # 1. Check current branch and state
    print("Checking repository state...")
    run_cmd(client, 'cd ~/Fiscalio && git rev-parse --abbrev-ref HEAD')
    run_cmd(client, 'cd ~/Fiscalio && git status')
    
    # 2. Add safe directory (sometimes avoids "not a git repository" or permission issues)
    run_cmd(client, 'git config --global --add safe.directory /home/fiscalio/Fiscalio')
    
    # 3. Fetch and reset
    print("Fetching and resetting to origin/dev...")
    run_cmd(client, 'cd ~/Fiscalio && git fetch origin')
    run_cmd(client, 'cd ~/Fiscalio && git checkout -f dev')
    run_cmd(client, 'cd ~/Fiscalio && git reset --hard origin/dev')
    
    # 4. Verify file content (check for evaluateInvoiceWarnings)
    print("Verifying if evaluateInvoiceWarnings exists...")
    out, _ = run_cmd(client, 'grep "evaluateInvoiceWarnings" ~/Fiscalio/sat-api/app/Http/Controllers/ProvisionalControlController.php')
    if "evaluateInvoiceWarnings" in out:
        print("SUCCESS: evaluateInvoiceWarnings found in controller.")
    else:
        print("FAILURE: evaluateInvoiceWarnings NOT FOUND in controller.")
        
    # 5. Laravel optimizations
    print("Laravel optimizations...")
    run_cmd(client, 'docker exec sat-api-app php artisan clear-compiled')
    run_cmd(client, 'docker exec sat-api-app php artisan optimize:clear')
    run_cmd(client, 'docker exec sat-api-app php artisan config:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan route:cache')
    run_cmd(client, 'docker exec sat-api-app php artisan view:cache')
    
    # 6. Restart containers
    run_cmd(client, 'docker restart sat-api-app fiscalio-agent fiscalio-runner')

    client.close()
    print("Server repair and deploy to dev completed!")
except Exception as e:
    print(f"Error: {str(e)}")
