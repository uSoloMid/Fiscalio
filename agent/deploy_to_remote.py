import paramiko
import os

def deploy_file(local_path, remote_path):
    print(f"Deploying {local_path} -> {remote_path}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    
    sftp = ssh.open_sftp()
    
    # Ensure remote directory exists
    remote_dir = os.path.dirname(remote_path)
    # This is a bit naive but works for simple paths
    ssh.exec_command(f"mkdir -p {remote_dir}")
    
    sftp.put(local_path, remote_path)
    sftp.close()
    ssh.close()
    print("Done.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        deploy_file(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python deploy_to_remote.py <local> <remote>")
