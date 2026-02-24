if __name__ == "__main__":
    from deploy_remote import execute_remote
    commands = [
        "docker ps"
    ]
    execute_remote("100.123.107.90", "fiscalio", "Solomid8", commands)
