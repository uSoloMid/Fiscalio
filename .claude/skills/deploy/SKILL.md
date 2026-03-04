---
name: deploy
description: Deploy the current branch changes to the Fiscalio MiniPC server. Commits staged changes, pushes to dev, then pulls on the server and restarts the affected containers.
argument-hint: [optional commit message]
allowed-tools: Bash
---

# Deploy to Fiscalio MiniPC

Deploy current changes to the server.

## Steps

### 1. Verify Branch
- Confirm we are on `dev` branch (NEVER deploy directly to `main`)
- If on `main`, stop and ask the user

### 2. Check Status
- Run `git status` to see what's staged/unstaged
- Run `git diff --stat` to summarize changes

### 3. Commit (if there are changes)
- Use commit message: $ARGUMENTS (or auto-generate a concise one from the diff)
- Stage relevant files (not *.py debug scripts, not .env files)
- Commit with Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

### 4. Push to dev
- `git push origin dev`

### 5. Pull on MiniPC via SSH
Use paramiko to connect: host=100.123.107.90, user=fiscalio, password=Solomid8

Run on server:
```bash
cd /home/fiscalio/Fiscalio-Test
git pull origin dev
```

### 6. Restart affected containers
If backend (sat-api/) changed:
```bash
docker exec sat-api-app-dev php artisan optimize:clear
cd /home/fiscalio/Fiscalio-Test/sat-api && docker compose up -d
```

If only frontend (ui/) changed: no server action needed (Vercel auto-deploys)

### 7. Confirm
- Check container is running: `docker ps | grep sat-api-app-dev`
- Report success or error to user

## Rules
- Only deploy to `dev`, never `main`
- Never commit .env files or debug *.py scripts in root
- If git pull fails due to divergent branches, report to user — do NOT force push
- Always run `php artisan optimize:clear` after backend changes
