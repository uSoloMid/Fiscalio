# Fiscalio - Sistema de Gestión de CFDI

Este proyecto es una herramienta robusta para la descarga, gestión y análisis de facturas (CFDI) directamente desde el SAT.

## 🚀 Guía de Inicio Rápido

Para iniciar el sistema completo, debes abrir **tres terminales** diferentes y ejecutar los siguientes comandos:

### 1. Terminal 1: Backend (API Laravel)
Inicia el núcleo del sistema y la base de datos.
```powershell
cd sat-api
# Iniciar servidor en el puerto 3333 (requerido por el proxy de la UI)
php artisan serve --port=3333
```

### 2. Terminal 2: Frontend (React + Vite)
Inicia la interfaz gráfica de usuario.
```powershell
cd ui
# Iniciar el servidor de desarrollo
npm run dev
```
*Accede a través de `http://localhost:5173` (o la URL que indique la terminal).*

### 3. Terminal 3: Procesador SAT (Runner)
**¡CRÍTICO!** Sin este comando, las facturas no se descargarán. Es el encargado de hablar con el SAT, esperar los paquetes y extraer los XMLs.
```powershell
cd sat-api
# Ejecutar el procesador en bucle permanente
php artisan sat:runner --loop
```

---

## 🛠️ Requisitos Técnicos
- **Backend:** PHP 8.2 o superior, Composer.
- **Frontend:** Node.js 18+, npm.
- **Base de Datos:** SQLite (por defecto).

## 💡 Notas Importantes
- **Duplicados:** No te preocupes por procesar los mismos archivos varias veces; el sistema identifica los UUIDs y evita duplicados automáticamente.
- **Nuevos Clientes:** Al añadir un cliente, el sistema inicia automáticamente una descarga de los últimos **5 años** de historial.
- **Seguridad:** Asegúrate de mantener tu archivo `sat-api/.env` configurado correctamente.

---
*Desarrollado con el asistente Antigravity*
