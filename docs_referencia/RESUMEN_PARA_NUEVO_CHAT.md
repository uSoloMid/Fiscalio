# Estado Actual del Proyecto (Fiscalio)

## Arquitectura "Frankenstein" Funcional 🧟‍♂️⚡
- **Backend (Mini PC):** Ubuntu + Docker corriendo Laravel (API en puerto 10000) y Runner (SAT Scraper).
- **Frontend (Nube):** Vercel desplegando React + Vite.
- **Túnel:** Cloudflare Tunnel expone la Mini PC en `https://api.fiscalio.cloud`.
- **Proxy (El Truco):** `vercel.json` intercepta tráfico `/api/*` en `fiscalio.cloud` y lo manda por debajo del agua a la Mini PC.

## Arreglos Críticos Implementados (NO TOCAR) 🚫
1. **Unzip Blindado:** El comando `SatRunnerCommand.php` usa `unzip` de sistema Linux, no ZipArchive de PHP (porque fallaba).
2. **Smart Extraction:** `XmlProcessorService.php` busca carpetas ya descomprimidas antes de intentar descomprimir.
3. **Vercel Config:** La variable `API_BASE_URL` en el frontend está vacía (`''`) para forzar el uso del Proxy de Vercel y evitar errores de CORS.

## Objetivo de esta Sesión: SERVIDOR DE PRUEBAS 🧪
Queremos dejar de trabajar "a corazón abierto" en Producción.
Necesitamos:

1. **Definir el Flujo Git:**
   - Rama `main` = Producción (Intocable).
   - Rama `dev` o `test` = Para romper cosas.

2. **Definir el Backend de Pruebas:**
   - **Opción A (Recomendada):** Levantar un **segundo stack de Docker** en la misma Mini PC (ej. puerto 10001) conectado a una base de datos de pruebas (`database_test.sqlite`).
   - **Opción B:** Usar la Laptop como servidor de pruebas (pero requiere prender el túnel en la laptop).

3. **Configurar el Frontend de Pruebas:**
   - Tener un deploy en Vercel (Preview) que apunte a ese Backend de Pruebas.

**Instrucción:** Guíame para configurar la **Opción A** (Docker paralelo en Mini PC) y el flujo de ramas.
