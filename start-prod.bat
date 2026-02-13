@echo off
setlocal
echo 🚀 Iniciando Fiscalio en modo produccion (Tailscale)...
echo IP del Servidor: 100.103.76.49

:: Moverse al directorio del backend
cd sat-api

:: 1. Iniciar Backend en una nueva ventana
echo 📦 Iniciando Backend (escuchando en 0.0.0.0:3333)...
start "Backend Server" cmd /c "php artisan serve --host=0.0.0.0 --port=3333"

:: 2. Iniciar SAT Runner en una nueva ventana
echo 🤖 Iniciando SAT Runner...
start "SAT Runner" cmd /c "php artisan sat:runner --loop"

:: 3. Mostrar mensajes finales
echo.
echo ✅ El sistema esta listo.
echo.
echo URL de la Interfaz: http://100.103.76.49:3333
echo Salud API: http://100.103.76.49:3333/api/health
echo.
echo ACCESO: Puedes abrir la interfaz directamente desde cualquier equipo en la red Tailscale.
echo.
echo Presiona cualquier tecla para cerrar este monitor (los procesos seguiran corriendo en sus ventanas).
pause > nul
