import paramiko
import json

def test_internal_login():
    host = '100.123.107.90'
    username = 'fiscalio'
    password = 'Solomid8'
    
    # Test internal login via curl inside the container
    payload = json.dumps({"email": "1", "password": "1"})
    # Need to escape the payload for the shell
    command = f"docker exec sat-api-app curl -v -X POST -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{payload}' http://localhost:10000/api/login"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=username, password=password)
        print(f"Executing: {command}")
        stdin, stdout, stderr = ssh.exec_command(command)
        print(f"OUT:\n{stdout.read().decode()}")
        print(f"ERR:\n{stderr.read().decode()}")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        ssh.close()

if __name__ == "__main__":
    test_internal_login()
