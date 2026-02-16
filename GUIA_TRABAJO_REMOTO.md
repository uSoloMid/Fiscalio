# 🌐 Guía de Trabajo Remoto - Ecosistema Fiscalio

Esta guía explica cómo colaborar en el proyecto Fiscalio desde diferentes máquinas, asegurando que la **Mini PC** siempre sea el centro de la verdad (Single Source of Truth).

## 🏗️ Arquitectura del Sistema
El sistema tiene dos entornos coexistiendo en la Mini PC:

1.  **Producción (Rama `main`):**
    *   **Directorio:** `~/Fiscalio`
    *   **Puerto:** `8080`
    *   **Base de Datos:** `Base_datos/database.sqlite` (Mapeada en container como `/var/www/Base_datos/database.sqlite`).
2.  **Desarrollo/Pruebas (Rama `dev`):**
    *   **Directorio:** `~/Fiscalio-Test`
    *   **Puerto:** `10001`
    *   **Base de Datos:** `Base_datos/database_dev.sqlite` (Mapeada en container como `/var/www/Base_datos/database_dev.sqlite`).


---

## 🔑 Acceso desde una Máquina Nueva

### 1. Configuración de SSH (Para desarrolladores/Agentes)
Para entrar a la Mini PC sin que te pida contraseña constantemente:
1.  Genera tu llave local: `ssh-keygen -t ed25519`.
2.  Copia tu llave pública al servidor:
    ```bash
    cat ~/.ssh/id_ed25519.pub | ssh fiscalio@192.168.100.97 "cat >> ~/.ssh/authorized_keys"
    ```
3.  Prueba entrando: `ssh fiscalio@192.168.100.97`.

### 2. Configuración del Entorno Local (.env)
Si vas a correr la **UI** en tu laptop pero quieres que use los datos de la Mini PC:
*   En `ui/src/api/config.ts`, asegúrate de que apunte a la URL del túnel o la IP de Tailscale.
*   En el **Backend** (`sat-api/.env`) de tu máquina local, **CUIDADO**: Si apuntas a una DB local, no verás los datos del servidor. Se recomienda trabajar directamente contra la API del servidor para ver datos reales.

---

## 💾 Gestión de la Base de Datos

### ¿Cómo obtener una copia de los datos reales?
Si quieres probar algo localmente con los 3 clientes y CFDI reales:
1.  Entra al servidor y genera un zip del archivo:
    ```bash
    ssh fiscalio@192.168.100.97 "cd ~/Fiscalio/sat-api/database && zip backup_db.zip database.sqlite"
    ```
2.  Descárgalo a tu máquina (vía SCP o SFTP).
3.  Colócalo en tu carpeta `sat-api/database/` local.

**⚠️ REGLA DE ORO:** Nunca hagas un `git push` o `git pull` que sobrescriba el archivo `database.sqlite` en el servidor sin un respaldo previo. El servidor tiene los cambios manuales y el histórico de descargas del SAT.

---

## 🔄 Flujo de Trabajo (Workflow)

### Para el Código:
1.  **Desarrollo:** Haz cambios en tu laptop.
2.  **Prueba:** Valida con la UI local.
3.  **Deploy:**
    *   Sube los cambios a GitHub (`git push`).
    *   En el servidor, haz `git pull`. *(Nota: Si el servidor tiene cambios manuales, usa `git stash` antes o resuelve los conflictos con cuidado).*
4.  **Reinicio:** Si cambiaste archivos de Docker o el `.env`, reinicia con:
    ```bash
    docker compose restart
    ```

### Para los Agentes IA (Antigravity):
El agente (yo) ahora tiene acceso SSH a la Mini PC. Puedo:
*   Ver logs: `docker logs -f sat-api-app` (Prod) o `docker logs -f sat-api-app-test` (Dev).
*   Ejecutar comandos Artisan: `docker exec sat-api-app php artisan ...`.
*   Sincronizar ramas: Puedo mover cambios entre `main` y `dev`.


---

## 🛠️ Comandos de Emergencia

| Problema | Solución |
| :--- | :--- |
| **"No veo mis clientes"** | Revisa en `.env` que `DB_CONNECTION=sqlite` y `DB_DATABASE` apunte a la ruta correcta. |
| **"El Runner no descarga"** | Revisa los logs: `docker logs fiscalio-runner`. Puede ser un problema de drivers de PHP o credenciales SAT. |
| **"Error 502/Gateway"** | El contenedor `sat-api-app` está detenido. Corre `docker compose up -d` en la carpeta `sat-api`. |

---

*Última actualización: 15 de Febrero, 2026 - Configuración de IP 192.168.100.97 confirmada.*
