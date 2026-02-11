# Script de inicio para Fiscalio
Write-Host "🚀 Iniciando Fiscalio..." -ForegroundColor Cyan

# 1. Iniciar Backend en una nueva ventana
Write-Host "📦 Iniciando Backend (Puerto 3333)..."
Start-Process cmd -ArgumentList "/c", "start", "Backend Server", "php", "artisan", "serve", "--port=3333" -WorkingDirectory "$PSScriptRoot\sat-api"

# 2. Iniciar SAT Runner en una nueva ventana
Write-Host "🤖 Iniciando SAT Runner..."
Start-Process cmd -ArgumentList "/c", "start", "SAT Runner", "php", "artisan", "sat:runner", "--loop" -WorkingDirectory "$PSScriptRoot\sat-api"

# 3. Iniciar Frontend en la ventana actual
Write-Host "🎨 Iniciando Frontend..."
cd ui
npm run dev
