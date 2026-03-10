import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("100.123.107.90", username="fiscalio", password="Solomid8", timeout=10)

stdin, stdout, stderr = ssh.exec_command("cd ~/Fiscalio && docker exec api php artisan tinker --execute=\"echo \\App\\Models\\Business::pluck('is_syncing', 'rfc');\"")
print("Output:", stdout.read().decode("utf-8"))
err = stderr.read().decode("utf-8")
if err: print("Error:", err)
ssh.close()
