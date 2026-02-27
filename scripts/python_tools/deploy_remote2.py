if __name__ == "__main__":
    from deploy_remote import execute_remote
    commands = [
        "cd ~/Fiscalio && git pull origin main",
        "cd ~/Fiscalio/sat-api && docker exec api php artisan optimize:clear",
        "cd ~/Fiscalio/sat-api && docker compose restart"
    ]
    execute_remote("100.123.107.90", "fiscalio", "Solomid8", commands)
