# Guía de Configuración - Fiscalio

Esta guía detalla los pasos necesarios para clonar y ejecutar este proyecto en una nueva máquina (laptop).

## 🧰 Requisitos de Software

Para que el sistema funcione, necesitas instalar lo siguiente:

### 1. Backend (sat-api)
*   **PHP 8.1 o superior**: Asegúrate de tener las siguientes extensiones habilitadas en tu `php.ini`:
    *   `bcmath`, `curl`, `dom`, `gd`, `mbstring`, `openssl`, `pdo_sqlite`, `sqlite3`, `zip`.
*   **Composer**: Gestor de dependencias de PHP. [Descargar aquí](https://getcomposer.org/).
*   **SQLite**: Generalmente viene incluido con PHP, pero asegúrate de que el driver esté activo.

### 2. Frontend (ui)
*   **Node.js (v16+)** y **npm**: [Descargar aquí](https://nodejs.org/).

---

## 🚀 Pasos para la Instalación

Una vez que tengas el código en tu laptop, sigue estos pasos:

### Configurar el Backend
1.  Entra a la carpeta `sat-api`:
    ```bash
    cd sat-api
    ```
2.  Instala las dependencias:
    ```bash
    composer install
    ```
3.  Crea tu archivo de entorno:
    ```bash
    cp .env.example .env
    ```
4.  Genera la clave de la aplicación:
    ```bash
    php artisan key:generate
    ```
5.  Crea la base de datos (SQLite):
    *   Crea un archivo vacío en `database/database.sqlite`.
    *   Ejecuta las migraciones:
        ```bash
        php artisan migrate
        ```

### Configurar el Frontend
1.  Entra a la carpeta `ui`:
    ```bash
    cd ../ui
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```

---

## 🛠️ Cómo ejecutar el sistema

Para trabajar, necesitas tener **3 terminales** abiertas:

1.  **Terminal 1 (API)**:
    ```bash
    cd sat-api
    php artisan serve --port=3333
    ```
2.  **Terminal 2 (SAT Runner)**:
    *Este es el que descarga las facturas en segundo plano.*
    ```bash
    cd sat-api
    php artisan sat:runner --loop
    ```
3.  **Terminal 3 (UI)**:
    ```bash
    cd ui
    npm run dev
    ```

---

## ☁️ Instrucciones para GitHub

Como el proyecto tiene dos partes, te recomiendo crear un **único repositorio** en GitHub para la carpeta raíz `Fiscalio`.

1.  **Inicializar Git** (en la carpeta raíz `Fiscalio`):
    ```bash
    git init
    ```
2.  **Añadir todo**:
    ```bash
    git add .
    ```
3.  **Primer Commit**:
    ```bash
    git commit -m "Initial commit: API + UI integration"
    ```
4.  **Subir a tu repo**:
    *(Crea un repo vacío en github.com y copia la URL)*
    ```bash
    git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
    git branch -M main
    git push -u origin main
    ```

> **Nota**: He configurado los archivos `.gitignore` para que **NO** se suban tus facturas reales ni tus contraseñas privadas al repositorio público por seguridad.
