@echo off
cd /d "%~dp0"
echo Iniciando Agente Fiscalio...
node index.js
if %errorlevel% neq 0 (
    echo.
    echo EL AGENTE SE HA DETENIDO POR UN ERROR.
    pause
)
