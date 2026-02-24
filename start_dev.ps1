# Script de inicio para Fiscalio (Modo Cliente)
Write-Host "🚀 Iniciando Fiscalio (Conexión a Mini PC)..." -ForegroundColor Cyan

# 1. Información de Servicios
Write-Host "💡 Nota: El Backend, SAT Runner y Agente están corriendo en la Mini PC (192.168.100.97)." -ForegroundColor Yellow
Write-Host "💡 Si necesitas ver logs del servidor: ssh fiscalio@192.168.100.97 'docker compose logs -f'" -ForegroundColor Gray

# 2. Iniciar Frontend
Write-Host "🎨 Iniciando Frontend ( apuntando a Mini PC )..."
cd ui
npm run dev
