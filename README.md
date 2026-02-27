# 🚀 Fiscalio - Sistema de Gestión de CFDI

Este documento es la fuente de verdad definitiva y unificada para cualquier desarrollador o IA que trabaje en este repositorio. Contiene el contexto operativo, arquitectura, credenciales y reglas de flujo de trabajo.

## 🏗️ 1. Arquitectura e Infraestructura
Fiscalio se divide de forma híbrida para máxima disponibilidad y procesamiento seguro:
- **Backend (API + Runner + Agent + DB)**: Alojado localmente en una **Mini PC Linux (Ubuntu)**.
    - **Tecnología**: Laravel 10+, PHP 8.2+, SQLite.
    - **Servicios Docker**: `api`, `runner` (extrae XMLs del SAT en bucle), `agent` (comunicación de credenciales CIEC/FIEL con extensión), `tunnel` (Cloudflared).
    - **Base de Datos**: SQLite, archivo físico mapeado desde el host a los contenedores.
- **Frontend (UI)**: Alojado y desplegado en la nube a través de **Vercel**.
    - **Tecnología**: React, Vite, TS, Tailwind CSS.

## 🔑 2. Conexión al Servidor (Mini PC)
La Mini PC está accesible de forma remota y persistente a través de Tailscale y SSH. Todo el procesamiento duro ocurre aquí.

- **IP Tailscale (Recomendada)**: `100.123.107.90`
- **Usuario SSH**: `fiscalio` (o `root`, la password es la misma)
- **Contraseña**: `Solomid8`
- **Ruta del Proyecto**: `~/Fiscalio` (o `/var/www` si entras como root en algunos logs).

**Comando de conexión:**
```bash
ssh fiscalio@100.123.107.90
```
*(Si usas llaves SSH puedes omitir la contraseña una vez configuradas).*

## 🌿 3. Flujo de Ramas (Branches) y Deploy
Usamos dos ramas principales para proteger el servidor del cliente:

1. **`dev` (Desarrollo / Staging)**
   - Aquí se programa.
   - Cada commit que haces a `dev` genera un despliegue automático de "Preview" en Vercel.
   - **ADVERTENCIA**: La UI de preview de Vercel en `dev` apunta a los mismos datos de la Mini PC, ¡cualquier cambio manipula datos reales de la BD!
2. **`main` (Producción)**
   - Es sagrada. Solo se actualiza tras probar en `dev`.
   - El código en `main` es el que corre en la Mini PC permanentemente.

**Flujo de Deploy Backend a Producción:**
Una vez integrados tus cambios a `main` en GitHub, entra a la Mini PC y ejecuta:
```bash
cd ~/Fiscalio
git pull origin main
docker exec api php artisan optimize:clear
docker compose restart
```
*(Puedes usar el script incluido `deploy_changes.py` si necesitas automatizar ésto en el futuro).*

## ⚠️ 4. Comandos Frecuentes de Docker y Laravel (En Mini PC)
Debes pararte en `~/Fiscalio` en el servidor:
- **Ver contenedores**: `docker ps`
- **Ver logs del Runner SAT**: `docker logs -f runner` (o revisar el archivo `runner.log`).
- **Reiniciar contenedores**: `docker restart api runner agent`
- **Limpiar cachés de Laravel**: `docker exec api php artisan optimize:clear`
- **Forzar chequeo de sincronía SAT de todos los clientes**: `docker exec api php artisan sat:sync-all`

## 📊 5. Capacidades del Sistema y Estado Actual
El sistema descarga, extrae, clasifica y audita comprobantes fiscales del SAT (México). Acciones destacadas:
- Detecta y extrae impuestos locales (ISH).
- Permite forzar verificaciones manuales individuales o masivas de CFDI en el portal.
- Los clientes se auditan cada **6 horas** de forma automática ("Sync Threshold").
- Genera vistas contables: Control Provisional (PUE, PPD, REP, desgloses por tasa 16%, 8%, 0%, Exentos) y descarga masiva de XML/PDFs consolidados.

## 🤖 6. Agente Scraper Avanzado (FIEL)
Ubicado en `/agent/scraper_sat.js`, es un motor basado en **Puppeteer** diseñado para automatizar descargas complejas que la API normal del SAT no permite:
- **Constancia de Situación Fiscal (CSF)**: Extracción binaria directa desde la memoria del navegador (Blob bypass) para obtener el PDF original sin marcas de agua ni capturas de pantalla.
- **Opinión de Cumplimiento (32-D)**: Monitoreo de red en tiempo real para capturar el flujo de datos del PDF.
- **Evasión de Errores SAT**: Detección automática y reintentos (3 niveles) ante Errores 500, "Sesiones Máximas Alcanzadas" e inestabilidad del portal.
- **Uso Local**: `node scraper_sat.js <RFC>` dentro de la carpeta `agent/`.

**Resoluciones Recientes a Bugs Críticos (Feb 2026):**
- **Mejora Scraper SAT**: Se implementó una técnica de "Blob Fetcher" en memoria para capturar Constancias Fiscales (CSF) originales, solucionando el problema de PDFs que parecían fotos/capturas.
- **Resiliencia SAT**: Se agregó un sistema de detección de errores 500 y "Service Unavailable" del SAT en el Scraper, permitiendo reintentos automáticos tras pausas de enfriamiento.
- Se removió un BOM hidden en `SatRunnerCommand.php` que rompía la ejecución PHP con el error de Namespace.
- Se configuró el límite de memoria a infinito (`memory_limit = -1`) en el Runner para prevenir muertes súbitas al extraer miles de archivos.
- Se agregó el botón de **Procesamiento Manual** directo en el Front-End (Historial de solicitudes SAT) para destrabar paquetes en estado "polling" o "downloading" a voluntad, sin depender exclusivamente del cron background.

## 💾 7. Backups y Resiliencia de Datos
La base de datos SQLite es el corazón del sistema. Se gestiona de la siguiente manera:
- **Automatización**: Existe un comando `db:backup` en Laravel que se ejecuta periódicamente (vía cron/scheduler).
- **Retención**: El script mantiene los 3 backups más recientes y elimina los que tengan más de 48 horas de antigüedad.
- **Backup Permanente**: Existe un archivo `~/Fiscalio/Base_datos/backups/database_PERMANENT.sqlite` que **NUNCA** es borrado por el script automático. 
- **⚠️ IMPORTANTE**: Siempre que realices cambios masivos o antes de una intervención crítica en la Mini PC, verifica que el `database_PERMANENT.sqlite` esté actualizado o crea uno nuevo. Este archivo es tu seguro de vida si la base de datos principal se corrompe.

---
**NOTA PARA ASISTENTES IA:** Si haces un cambio arquitectónico u operativo, actualiza este README para mantener la fuente de la verdad sincronizada.
