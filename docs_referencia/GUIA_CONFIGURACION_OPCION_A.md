# 🧪 Guía de Configuración: Entorno de Pruebas (Opción A - Mini PC)

Esta guía te permitirá configurar un entorno de pruebas paralelo en tu Mini PC, tal como lo definimos en la **Opción A**.

---

## 🏗️ 1. Arquitectura Final
Tendremos dos copias de Fiscalio corriendo simultáneamente en la Mini PC:

| Entorno | Rama Git | Puerto (API) | Base de Datos | URL Pública |
| :--- | :--- | :--- | :--- | :--- |
| **Producción** 🟢 | `main` | `10000` | `database.sqlite` | `api.fiscalio.cloud` |
| **Pruebas** 🧪 | `dev` | `10001` | `database_test.sqlite` | `test-api.fiscalio.cloud` |

---

## ⚡ 2. Pasos en la Mini PC (Servidor)

Conéctate por SSH a tu Mini PC: `ssh fiscalio@192.168.1.89` (o tu IP).

### Paso 2.1: Rescatar Cambios Manuales (CRÍTICO 🚨)
Mencionaste que hay cambios manuales en el servidor. Antes de hacer nada, aseguremos eso.

1.  Ve a tu carpeta actual (Producción):
    ```bash
    cd ~/Fiscalio
    ```
2.  Revisa qué archivos han cambiado:
    ```bash
    git status
    ```
3.  **Si ves archivos modificados (rojos)** que quieres guardar:
    *   Crea una rama temporal de respaldo y guárdalos:
        ```bash
        git checkout -b respaldo-manuales
        git add .
        git commit -m "Respaldo de cambios manuales en servidor"
        ```
    *   *Nota: Si prefieres descartar los cambios y alinearte a GitHub, usa `git checkout .` (Cuidado, esto borra cambios).*

### Paso 2.2: Actualizar Producción
Una vez asegurados los cambios, actualiza la rama `main` con la nueva configuración de Docker que preparé (que soporta puertos dinámicos).

```bash
git checkout main
git pull origin main
```
*Si git se queja de conflictos, tendrás que resolverlos o forzar (si ya respaldaste).*

Reinicia Producción para aplicar la nueva config (no debería afectar nada, seguirá en puerto 10000):
```bash
docker compose up -d --build
```
*(Verifica que todo siga funcionando en `api.fiscalio.cloud/status`)*

### Paso 2.3: Configurar el Entorno de Pruebas
Vamos a clonar el proyecto en una **carpeta separada** para no mezclar las bases de datos ni los archivos.

1.  Vuelve al home:
    ```bash
    cd ~
    ```
2.  Clona la rama `dev` en una nueva carpeta `Fiscalio-Test`:
    ```bash
    git clone -b dev https://github.com/uSoloMid/Fiscalio.git Fiscalio-Test
    ```
    *(Nota: Asegúrate de tener permisos o usar el token si es repo privado).*

3.  Entra a la carpeta de pruebas:
    ```bash
    cd Fiscalio-Test/sat-api
    ```
    *(Nota: Si clonaste todo el repo, busca la carpeta donde está el `docker-compose.yml`, asumiré `sat-api` o raíz según veas).*

4.  Configura las variables de entorno para **Pruebas**:
    ```bash
    cp .env.example .env
    nano .env
    ```
    **Edita/Añade estas líneas al final del archivo `.env`:**
    ```ini
    APP_PORT=10001
    DB_DATABASE=/var/www/database/database_test.sqlite
    # Asegúrate de que APP_DEBUG=true para ver errores en pruebas
    ```

5.  Levanta el contenedor de Pruebas:
    ```bash
    docker compose -p fiscalio-test up -d --build
    ```
    *Usamos `-p fiscalio-test` para que Docker sepa que es un proyecto distinto al de Producción.*

6.  Verifica que ambos estén corriendo:
    ```bash
    docker ps
    ```
    *Deberías ver un contenedor en puerto `0.0.0.0:10000->10000/tcp` (Prod) y otro en `0.0.0.0:10001->10000/tcp` (Test).*

---

## ☁️ 3. Configurar Cloudflare Tunnel
Para que Vercel pueda ver tu entorno de pruebas, necesitamos exponer el puerto **10001**.

1.  Ve al Dashboard de **Cloudflare Zero Trust** > Tunnels.
2.  Selecciona tu túnel activo y dale a **Configure**.
3.  Ve a la pestaña **Public Hostnames**.
4.  Añade uno nuevo:
    *   **Subdomain:** `test-api`
    *   **Domain:** `fiscalio.cloud`
    *   **Service:** `http://localhost:10001`
5.  Guarda. ¡Listo! Ahora `https://test-api.fiscalio.cloud` apunta a tu Docker de pruebas.

---

## 🎨 4. Frontend (Vercel)
Ya he configurado la rama `dev` en el repositorio `ui` para que apunte a `test-api.fiscalio.cloud` mediante el archivo `vercel.json`.

1.  Simplemente haz push de cualquier cambio a la rama `dev` en GitHub.
2.  Vercel detectará la rama y creará un **Preview Deployment**.
3.  Ese deploy preview se conectará automáticamente a tu Mini PC (Puerto 10001).

---

## 🔄 Flujo de Trabajo Rutinario
- **Para desarrollar:** Trabaja en rama `dev`. Push -> Vercel Preview -> Backend Test.
- **Para lanzar:** Merge `dev` a `main`. Push -> Vercel Prod -> Backend Prod (Pull manual en servidor por ahora).

🚀 **¡Listo para probar sin miedo!**
