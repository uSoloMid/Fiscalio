# 🖥️ Guía de Administración - Servidor Fiscalio (Mini PC)

Esta guía contiene los comandos y pasos necesarios para administrar tu servidor local en la Mini PC.

## 🔑 Cómo Conectarse desde tu Laptop
Para entrar al sistema de la Mini PC desde tu terminal de Windows (PowerShell o CMD):

1. **Comando Principal:**
   ```bash
   ssh fiscalio@100.123.107.90
   ```

2. **¿Cómo saber la IP si cambia? (Escribir esto en la Mini PC):**
   ```bash
   hostname -I
   ```
   *(Anota el primer número que te salga, ej: 192.168.1.xx, y úsalo para el comando ssh).*

3. **Ir a la carpeta del proyecto:**
   ```bash
   cd ~/Fiscalio
   ```

---

## 🐋 Comandos de Docker (Los más usados)
Una vez dentro de la carpeta `~/Fiscalio`, usa estos comandos:

- **Ver el estado de los servicios:**
  ```bash
  docker ps
  ```
  *(Debes ver 4 contenedores: api, runner, agent y tunnel con status "Up")*

- **Encender todo el sistema (en segundo plano):**
  ```bash
  docker compose up -d
  ```

- **Apagar todo el sistema:**
  ```bash
  docker compose down
  ```

- **Reiniciar servicios (si algo falla o cambias el .env):**
  ```bash
  docker compose restart
  ```

- **Ver qué está pasando (Log de errores):**
  ```bash
  docker compose logs -f
  ```
  *(Presiona Ctrl+C para dejar de verlos)*

---

## 🛠️ Comandos de Laravel (Dentro de Docker)
Si necesitas ejecutar algo dentro de la aplicación PHP:

- **Limpiar caché de Laravel:**
  ```bash
  docker exec fiscalio-api php artisan optimize:clear
  ```

- **Ver lista de rutas (puertas de entrada):**
  ```bash
  docker exec fiscalio-api php artisan route:list
  ```

- **Ejecutar migraciones (actualizar base de datos):**
  ```bash
  docker exec fiscalio-api php artisan migrate
  ```

---

## 🌐 URLs del Sistema
- **API Pública:** `https://api.fiscalio.cloud`
- **Verificación de Estado:** `https://api.fiscalio.cloud/status`

---

## ⚠️ En caso de Emergencia (Sin Internet o Luz)
1. **Apagón:** La Mini PC se prenderá sola (configurado en BIOS) y Docker arrancará los servicios solo. Espera 2 minutos.
2. **Error 502 (Bad Gateway):** Casi siempre significa que la API se detuvo o está reiniciando. Revisa con `docker ps`.
3. **Cambio de Casa:** Al conectar la Mini PC en otra red, el túnel de Cloudflare seguirá funcionando, pero el comando `ssh` usará una IP diferente. ¡Búscala con `hostname -I` directamente en el monitor de la Mini PC!
