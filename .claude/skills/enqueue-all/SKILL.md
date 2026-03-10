---
name: enqueue-all
description: Encolar todos los clientes con FIEL para descargar CSF y Opinión 32-D. Use when the user wants to trigger CSF/Opinion downloads for all clients, or check queue status on the fiscalio-agent container.
allowed-tools: Bash
---

# Enqueue-All — Cola de CSF/Opinión para todos los clientes

Dispara la cola del scraper SAT en `fiscalio-agent` para procesar CSF y Opinión 32-D de todos los RFCs con FIEL.

## Comportamiento de la cola

- Detecta todos los RFCs en `fiel/` (con `.cer`, `.key`, `clave.txt`)
- Procesa uno a la vez (un browser Puppeteer)
- Cada RFC: hasta **3 intentos externos** (si falla → al final de la cola)
- Internamente el scraper ya tiene 3 intentos por CSF y 3 por Opinión
- La cola termina sola cuando todos pasaron o agotaron sus 3 intentos externos

## Disparar la cola

```python
import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('100.123.107.90', username='fiscalio', password='Solomid8', timeout=15)

cmd = '''docker exec fiscalio-agent node -e "
const http = require('http');
const req = http.request({ hostname:'localhost', port:3005, path:'/enqueue-all', method:'POST' }, res => {
  let d=''; res.on('data', c => d+=c); res.on('end', () => console.log(d));
});
req.on('error', e => console.log('ERR:'+e.message));
req.end();
" 2>&1'''

stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='replace'))
client.close()
```

Respuesta esperada: `{"queued": N, "total": N, "running": true}`

## Ver estado de la cola

```python
cmd = '''docker exec fiscalio-agent node -e "
const http = require('http');
const req = http.request({ hostname:'localhost', port:3005, path:'/queue-status', method:'GET' }, res => {
  let d=''; res.on('data', c => d+=c); res.on('end', () => console.log(d));
});
req.on('error', e => console.log('ERR:'+e.message));
req.end();
" 2>&1'''
```

Respuesta: `{"running": true/false, "pending": N, "queue": [{"rfc":"...", "attempts": N}]}`

## Ver progreso en logs

```bash
docker logs fiscalio-agent --tail 30 2>&1
```

Buscar líneas `[COLA]` para ver avance, `✅` para éxitos, `❌` para agotados.

## Notas

- El container no tiene `curl` — usar `node -e` para llamadas HTTP internas
- El puerto 3005 no está mapeado al host, solo accesible desde dentro del container
- Si la cola ya está corriendo, `/enqueue-all` agrega RFCs faltantes sin duplicar
