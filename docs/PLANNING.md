# Planning — Tarea en curso

> **Instrucciones para la IA:**
> - Actualiza este archivo al iniciar cada tarea y al completar cada paso.
> - Cuando la tarea esté 100% estable y commiteada, mueve la entrada a `docs/HISTORY.md` y borra esta sección.
> - Solo debe existir **una tarea activa** aquí a la vez. Si hay nueva tarea, la anterior debió haberse completado primero.

---

## Seguridad — Hardening general (Mar 2026)

**Archivos modificados:**
- `sat-api/routes/api.php` — eliminar rutas /debug/*, throttle en login
- `sat-api/app/Providers/RouteServiceProvider.php` — rate limiter `login` (5/min)
- Servidor: `APP_ENV=production`, `APP_DEBUG=false` en .env

**Pasos:**
- [x] Eliminar `/debug/parser` y `/debug/update-dev` (exec sin auth)
- [x] Rate limiting 5 intentos/min por IP en `/api/login`
- [x] `APP_ENV=production` y `APP_DEBUG=false` en servidor
- [ ] Commit y deploy a main
