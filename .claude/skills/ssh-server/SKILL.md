---
name: ssh-server
description: Run commands on the Fiscalio production server via SSH (paramiko). Use when ssh fiscalio-server doesn't work (no SSH keys configured). Pass the command to run as argument.
argument-hint: "comando a ejecutar en el servidor"
allowed-tools: Bash, Write
---

# SSH al servidor Fiscalio — via Paramiko

`ssh fiscalio-server` no funciona en esta máquina (no hay llaves SSH configuradas).
Usar Python paramiko como método de conexión.

## Datos de conexión

| Campo | Valor |
|-------|-------|
| Host | `100.123.107.90` |
| Usuario | `fiscalio` |
| Contraseña | `Solomid8` |
| Red | Tailscale (requiere que Tailscale esté activo) |

## Container principal
- `sat-api-app` — backend Laravel (puerto 10000)
- `fiscalio-db` — MySQL (password: `Solomid8`, db: `fiscalio_prod`)
- `fiscalio-agent` — scraper Node.js SAT
- `fiscalio-runner` — runner SAT
- `fiscalio-tunnel` — túnel Tailscale

## Patrón base para ejecutar un comando

```python
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

def run_cmd(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    return stdout.read().decode('utf-8', errors='replace'), stderr.read().decode('utf-8', errors='replace')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=15)

out, err = run_cmd(client, 'TU_COMANDO_AQUI')
print(out)
if err: print('STDERR:', err)

client.close()
```

## Consultar MySQL directamente

```bash
docker exec fiscalio-db mysql -u root -pSolomid8 fiscalio_prod -e "SELECT ..."
```

## Ejecutar artisan (Laravel)

Nota: `tinker` en modo no-interactivo requiere `--execute` y tiene **Restricted Mode** (no hace nada sin `--trust-project` que no existe). Preferir MySQL directo para consultas, o crear un comando artisan dedicado.

```bash
docker exec sat-api-app php artisan migrate --force
docker exec sat-api-app php artisan optimize:clear
```

## Leer logs

```bash
docker logs fiscalio-agent --tail 50 2>&1
docker exec sat-api-app tail -100 storage/logs/laravel.log
```

## Ejecutar el argumento del usuario

Si $ARGUMENTS contiene un comando, ejecutarlo vía paramiko escribiendo un script temporal:

```python
# Escribir script en /tmp/_ssh_cmd.py y ejecutar
# con: python /tmp/_ssh_cmd.py
```

## Reglas
- Usar `sys.stdout.reconfigure(encoding='utf-8')` siempre (los logs tienen emojis)
- Usar `decode('utf-8', errors='replace')` en todos los reads
- No almacenar la contraseña en archivos commiteados al repo — está en scripts/ que están en .gitignore
- Tailscale debe estar activo para que la IP `100.123.107.90` sea alcanzable
