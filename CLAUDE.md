# Fiscalio — Contexto Global para Agentes IA

> **Este archivo es el contrato entre el proyecto y todos los agentes IA (Claude, Gemini/Antigravity, etc.).**
> Leerlo completo antes de tocar cualquier cosa. No hacer suposiciones que contradigan lo escrito aquí.

---

## 🗺️ Arquitectura del Sistema

```
[Usuario] → [Vercel Frontend] → [Cloudflare Tunnel] → [MiniPC Docker] → [MariaDB]
                                  api.fiscalio.cloud         sat-api-app
                                  api-dev.fiscalio.cloud     sat-api-app-dev
```

| Componente | Tecnología | Ubicación |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind | Vercel (branch `main` → prod, `dev` → preview) |
| Backend API | Laravel 10 + PHP 8.3 | MiniPC Docker, imagen `fiscalio-sat-api` |
| Base de datos | MariaDB 10.6 (container `fiscalio-db`) | MiniPC local |
| SAT Runner | PHP Artisan command (scraper background) | MiniPC Docker |
| Bank Parser | Python 3 + pdfplumber | MiniPC, montado en `/var/www/bank_parser` |
| Túnel | Cloudflare Tunnel (`fiscalio-tunnel`) | MiniPC |

---

## 🐳 Containers en el MiniPC

| Container | Puerto Host | BD | Rama Git | URL externa |
|---|---|---|---|---|
| `sat-api-app` | 10000 | `fiscalio_prod` | `main` | `api.fiscalio.cloud` |
| `sat-api-app-dev` | 10001 | `fiscalio_dev` | `dev` | `api-dev.fiscalio.cloud` |
| `fiscalio-db` | 3306 | ambas BDs | — | solo interno |
| `fiscalio-tunnel` | — | — | — | Cloudflare |
| `fiscalio-runner` | — | prod | `main` | — |
| `fiscalio-runner-dev` | — | dev | `dev` | — |

**Acceso SSH al MiniPC:** `fiscalio@100.123.107.90` (Tailscale)

---

## 🚦 Flujo de Trabajo Git

```
feature/fix → dev (prueba en preview Vercel + api-dev) → merge a main (producción)
```

- **Nunca commitear directo a `main`**
- Todo nuevo trabajo va a `dev`
- Solo hacer merge a `main` cuando esté probado en dev
- Al inicio de cada sesión: `git pull origin dev`

---

## 🔗 URLs del Proyecto

| Entorno | Frontend | API |
|---|---|---|
| **Producción** | `https://fiscalio.cloud` (o Vercel main) | `https://api.fiscalio.cloud` |
| **Desarrollo** | Vercel preview del branch `dev` | `https://api-dev.fiscalio.cloud` |

---

## 🚫 REGLAS CRÍTICAS — NO TOCAR SIN ENTENDER

### 1. `API_BASE_URL` debe estar vacío (`''`)
**Archivo:** `ui/src/api/config.ts`
```typescript
export const API_BASE_URL = '';  // NO cambiar a URL directa
```
Razón: el frontend usa el proxy de Vercel (`vercel.json`) para evitar errores CORS.
Cambiar esto a una URL directa rompe la autenticación en producción.

### 2. `config:cache` y `route:cache` están desactivados en entrypoint
**Archivo:** `sat-api/docker/entrypoint.sh`
Razón: prod y dev comparten el volumen `/var/www`. Cachear config sobreescribe
la configuración del otro container con la DB equivocada.

### 3. Unzip del SAT Runner usa comando de sistema, no ZipArchive PHP
**Archivo:** `sat-api/app/Console/Commands/SatRunnerCommand.php`
Razón: ZipArchive de PHP fallaba en el servidor. El comando `unzip` de Linux funciona.

### 4. Smart Extraction en XmlProcessorService
**Archivo:** `sat-api/app/Services/XmlProcessorService.php`
Razón: busca carpetas ya descomprimidas antes de intentar descomprimir de nuevo.

### 5. `vercel.json` del branch `dev` apunta a `api-dev.fiscalio.cloud`
**Archivo:** `ui/vercel.json` (branch dev)
El branch `main` apunta a `api.fiscalio.cloud` (prod).

---

## 📁 Estructura de Archivos Clave

```
Fiscalio/
├── CLAUDE.md                          ← Este archivo (leer primero)
├── sat-api/                           ← Backend Laravel
│   ├── app/
│   │   ├── Http/Controllers/          ← Controladores API
│   │   ├── Models/                    ← Eloquent models
│   │   ├── Console/Commands/
│   │   │   └── SatRunnerCommand.php   ← 🚫 NO TOCAR (scraper SAT)
│   │   └── Services/
│   │       └── XmlProcessorService.php ← 🚫 NO TOCAR (extractor XML)
│   ├── database/migrations/           ← Migraciones (nunca rollback en prod)
│   ├── docker/
│   │   └── entrypoint.sh             ← 🚫 config:cache desactivado intencionalmente
│   └── nginx/
│       └── render.conf               ← Nginx config (client_max_body_size 50M)
├── ui/                                ← Frontend React
│   ├── src/
│   │   ├── api/config.ts             ← 🚫 API_BASE_URL debe ser ''
│   │   ├── services.ts               ← Todas las llamadas API
│   │   ├── models.ts                 ← Tipos TypeScript
│   │   └── pages/                    ← Páginas principales
│   └── vercel.json                   ← Proxy config (diferente en main vs dev)
└── bank_parser/
    └── adapters/
        ├── bbva.py                    ← Parser BBVA (funcional)
        └── banamex.py                 ← Parser Banamex (mejorado Mar 2026)
```

---

## 🗄️ Base de Datos — Tablas Principales

| Tabla | Descripción |
|---|---|
| `users` | Usuarios del sistema |
| `businesses` | Clientes/empresas (RFC, nombre, etc.) |
| `cfdis` | Facturas descargadas del SAT |
| `cfdi_payments` | Complementos de pago (tipo P) |
| `accounts` | Catálogo de cuentas contables |
| `bank_statements` | Estados de cuenta bancarios importados |
| `bank_movements` | Movimientos individuales (cargo/abono) |
| `sat_requests` | Cola de solicitudes al SAT |
| `groups` | Grupos de clientes |
| `tags` | Etiquetas para facturas |

**Migraciones:** nunca correr `migrate:rollback` en producción.

---

## 🔧 Cómo Hacer Deploy

### Deploy normal (código):
```bash
git add .
git commit -m "descripción"
git push origin dev   # nunca main directo
```
Vercel detecta el push y redespliega automáticamente el frontend.
El backend (MiniPC) toma el código del volumen montado — cambios en archivos PHP/Python
son inmediatos sin reiniciar el container.

### Si hay que reiniciar un container:
```bash
# PRECAUCIÓN: reiniciar sat-api-app-dev puede afectar sat-api-app si comparten volumen
docker restart sat-api-app-dev
# Después del restart, verificar que config:clear corrió bien
docker exec sat-api-app php artisan config:clear
docker exec sat-api-app-dev php artisan config:clear
```

### Migraciones en dev:
```bash
docker exec sat-api-app-dev php artisan migrate --force
```

---

## 📦 Módulos del Sistema (Estado Actual)

| Módulo | Estado | Notas |
|---|---|---|
| Login / Auth | ✅ Producción | Sanctum token en localStorage |
| Dashboard | ✅ Producción | |
| CFDIs / Facturas | ✅ Producción | Descarga del SAT automática |
| SAT Runner | ✅ Producción | Background worker |
| Estados de Cuenta | ✅ Producción | Parser BBVA + Banamex |
| Conciliación Bancaria | ✅ Dev (Mar 2026) | Semi-automático, niveles de confianza |
| Grupos y Tags | ✅ Producción | |
| Opiniones SAT | 🔲 Pendiente | |
| Pólizas CONTPAQi | 🔲 Futuro | Via n8n (Paso 13) |

---

## 🤝 Reglas para Agentes IA

1. **Leer este archivo antes de cualquier cambio**
2. **Nunca modificar main directamente** — solo dev
3. **Antes de reiniciar containers**, avisar al usuario y verificar que no hay cache compartido
4. **Nunca cambiar `API_BASE_URL`** sin leer la sección de reglas críticas
5. **Antes de agregar migraciones**, verificar que no rompen prod (columnas nullable, defaults seguros)
6. **No tocar `SatRunnerCommand.php` ni `XmlProcessorService.php`** sin permiso explícito
7. **Al inicio de sesión**: hacer `git pull origin dev` para tener el contexto actualizado
8. **Documentar los NO TOCAR** en este archivo cuando se descubran nuevos

---

## 🖥️ Estaciones de Trabajo

| Lugar | Equipo | Acceso |
|---|---|---|
| Casa | PC principal | VS Code + Claude Code |
| Oficina | PC oficina | VS Code + Claude Code |
| Laptop | Portátil | VS Code + Claude Code / Antigravity |

**Sincronización:** `git pull origin dev` al inicio de cada sesión en cualquier equipo.
El MiniPC siempre está encendido y accesible via Tailscale (`100.123.107.90`).
