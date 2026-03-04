---
name: migrate
description: Run Laravel database migrations on the Fiscalio dev or prod server. Defaults to dev (fiscalio_dev). Pass 'prod' to run on production — will ask for confirmation first.
argument-hint: [dev|prod]
allowed-tools: Bash
---

# Run Migrations

Run Laravel migrations on Fiscalio server.

## Target
- Default: **dev** (sat-api-app-dev → fiscalio_dev)
- If $ARGUMENTS contains "prod": **prod** (sat-api-app → fiscalio_prod)

## Process

### If target is PROD
- Ask the user to confirm before proceeding: "Are you sure? This will modify fiscalio_prod."
- Wait for explicit confirmation

### Run migration
Connect to MiniPC via paramiko: host=100.123.107.90, user=fiscalio, password=Solomid8

For dev:
```bash
docker exec sat-api-app-dev php artisan migrate --force 2>&1
```

For prod:
```bash
docker exec sat-api-app php artisan migrate --force 2>&1
```

### Report
- Show migration output
- List which migrations ran
- If error: show full error and stop — do NOT retry automatically

## Rules
- Never run prod migrations without explicit user confirmation
- If migration fails partway, report what ran and what failed — do not attempt rollback automatically
- Always show the full output, not a summary
