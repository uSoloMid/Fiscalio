# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Seguridad — Proteger rutas /agent/* con AGENT_SECRET

**Archivos modificados:**
- `sat-api/app/Http/Middleware/AgentSecret.php` (nuevo)
- `sat-api/app/Http/Kernel.php` — registrar middleware `agent.secret`
- `sat-api/routes/api.php` — aplicar middleware a rutas /agent/*
- `sat-api/config/app.php` — añadir `agent_secret` key
- `sat-api/.env` + `.env.example` — `AGENT_SECRET`
- `sat-api/app/Models/Business.php` — ocultar `certificate` y `private_key`
- `agent/index.js` — enviar `X-Agent-Secret` en sync-clients y runner-tick
- `agent/scraper_sat.js` — enviar `X-Agent-Secret` en upload-document
- `agent/.env` — agregar `AGENT_SECRET`

**Pasos:**
- [x] Crear middleware `AgentSecret.php` con `hash_equals`
- [x] Registrar en Kernel como `agent.secret`
- [x] Aplicar a rutas `/agent/*` en api.php
- [x] Agregar `AGENT_SECRET` a config/app.php, .env, .env.example
- [x] Actualizar agent/index.js para enviar header
- [x] Actualizar agent/scraper_sat.js para enviar header
- [x] Ocultar `certificate` y `private_key` en Business model
- [ ] Deploy y verificar que sin token retorna 401
