if __name__ == "__main__":
    from deploy_remote import execute_remote
    commands = [
        "docker exec api cp /var/www/docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf",
        "docker exec api supervisorctl reload",
        "docker compose -f ~/Fiscalio/sat-api/docker-compose.yml restart"
    ]
    execute_remote("100.123.107.90", "fiscalio", "Solomid8", commands)
