import paramiko
import os

FILES_TO_DEPLOY = [
    ('sat-api/database/migrations/2026_03_11_134059_create_scraper_manual_requests_table.php', '/home/fiscalio/Fiscalio/sat-api/database/migrations/2026_03_11_134059_create_scraper_manual_requests_table.php'),
    ('sat-api/app/Models/ScraperManualRequest.php', '/home/fiscalio/Fiscalio/sat-api/app/Models/ScraperManualRequest.php'),
    ('sat-api/app/Http/Controllers/Api/ScraperManualController.php', '/home/fiscalio/Fiscalio/sat-api/app/Http/Controllers/Api/ScraperManualController.php'),
    ('sat-api/routes/api.php', '/home/fiscalio/Fiscalio/sat-api/routes/api.php'),
    ('sat-api/app/Services/XmlProcessorService.php', '/home/fiscalio/Fiscalio/sat-api/app/Services/XmlProcessorService.php'),
    ('sat-api/app/Console/Commands/ScraperManualBulk.php', '/home/fiscalio/Fiscalio/sat-api/app/Console/Commands/ScraperManualBulk.php'),
    ('sat-api/app/Console/Commands/ScraperManualRunner.php', '/home/fiscalio/Fiscalio/sat-api/app/Console/Commands/ScraperManualRunner.php'),
    ('sat-api/docker-compose.yml', '/home/fiscalio/Fiscalio/sat-api/docker-compose.yml'),
    ('agent/scraper_xml.js', '/home/fiscalio/Fiscalio/agent/scraper_xml.js'),
]

def deploy_all():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    sftp = ssh.open_sftp()
    
    for local, remote in FILES_TO_DEPLOY:
        # Check if local exists
        local_path = os.path.join('c:\\Fiscalio', local)
        if not os.path.exists(local_path):
            print(f"SKIP: {local_path} does not exist")
            continue
            
        print(f"Deploying {local} ...")
        remote_dir = os.path.dirname(remote)
        ssh.exec_command(f"mkdir -p {remote_dir}")
        sftp.put(local_path, remote)
    
    sftp.close()
    ssh.close()
    print("Bulk deployment finished.")

if __name__ == "__main__":
    deploy_all()
