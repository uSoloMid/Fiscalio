---
description: Iniciar el sistema completo (Backend, Frontend y SAT Runner)
---

Este workflow inicia los tres componentes necesarios para que Fiscalio funcione correctamente.

// turbo
1. Ejecutar el script de inicio automatizado:
   ```powershell
   .\start_dev.ps1
   ```

Alternativamente, si prefieres hacerlo manualmente en terminales separadas:

1. **Backend:**
   ```powershell
   cd sat-api
   php artisan serve --port=3333
   ```

2. **Frontend:**
   ```powershell
   cd ui
   npm run dev
   ```

3. **SAT Runner:**
   ```powershell
   cd sat-api
   php artisan sat:runner --loop
   ```
