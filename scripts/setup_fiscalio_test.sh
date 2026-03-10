#!/bin/bash
set -e

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==> Iniciando configuración de Entorno de Pruebas Fiscalio (Opción A)${NC}"

# 1. Asegurar Producción
echo -e "${YELLOW}==> Paso 1: Asegurando Producción en ~/Fiscalio...${NC}"
cd ~/Fiscalio

# Verificar estado de git
# Configurar identidad de git para evitar errores en el commit
git config user.email "server@fiscalio.cloud"
git config user.name "Fiscalio Server"

if [[ `git status --porcelain` ]]; then
  echo -e "${RED}Detectados cambios manuales en producción.${NC}"
  BACKUP_BRANCH="backup-manual-$(date +%s)"
  echo -e "${YELLOW}Creando rama de respaldo: $BACKUP_BRANCH...${NC}"
  git checkout -b $BACKUP_BRANCH
  git add .
  git commit -m "Respaldo automático antes de deploy de pruebas"
  echo -e "${GREEN}Respaldo creado.${NC}"
fi

# Actualizar Main
echo -e "${YELLOW}==> Actualizando rama main...${NC}"
git checkout main
git pull origin main

# Reiniciar Docker Producción (para tomar cambios de docker-compose.yml si hubo)
echo -e "${YELLOW}==> Reiniciando Docker de Producción...${NC}"
if [ -d "sat-api" ]; then
    cd sat-api
    docker compose up -d --build
    cd ..
else
    echo -e "${RED}No se encontró la carpeta sat-api en Producción. Saltando reinicio.${NC}"
fi

# 2. Configurar Pruebas
echo -e "${YELLOW}==> Paso 2: Configurando Entorno de Pruebas en ~/Fiscalio-Test...${NC}"
cd ~

if [ -d "Fiscalio-Test" ]; then
    echo -e "${YELLOW}La carpeta Fiscalio-Test ya existe. Actualizando...${NC}"
    cd Fiscalio-Test
    git fetch origin
    git checkout dev
    git pull origin dev
else
    echo -e "${YELLOW}Clonando repositorio (rama dev)...${NC}"
    git clone -b dev https://github.com/uSoloMid/Fiscalio.git Fiscalio-Test
    cd Fiscalio-Test
fi

# Entrar a la carpeta de la API (asumiendo estructura actual)
if [ -d "sat-api" ]; then
    cd sat-api
fi

# Configurar .env de Pruebas
echo -e "${YELLOW}==> Configurando .env para Pruebas (Puerto 10001)...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Reemplazar o agregar variables
# Asegurar que APP_PORT es 10001
if grep -q "APP_PORT=" .env; then
    sed -i 's/^APP_PORT=.*/APP_PORT=10001/' .env
else
    echo "APP_PORT=10001" >> .env
fi

# Asegurar DB de pruebas
if grep -q "DB_DATABASE=" .env; then
    sed -i 's|^DB_DATABASE=.*|DB_DATABASE=/var/www/database/database_test.sqlite|' .env
else
    echo "DB_DATABASE=/var/www/database/database_test.sqlite" >> .env
fi

# Asignar nombre único al contenedor de pruebas
if grep -q "APP_CONTAINER_NAME=" .env; then
    sed -i 's/^APP_CONTAINER_NAME=.*/APP_CONTAINER_NAME=sat-api-app-test/' .env
else
    echo "APP_CONTAINER_NAME=sat-api-app-test" >> .env
fi

# Crear archivo de DB de pruebas si no existe
mkdir -p database
touch database/database_test.sqlite

# Levantar Docker de Pruebas
echo -e "${YELLOW}==> Levantando Docker de Pruebas (Proyecto: fiscalio-test)...${NC}"
docker compose -p fiscalio-test up -d --build

# Verificación
echo -e "${GREEN}==> ¡Instalación Completada!${NC}"
echo -e "Producción (Main): Puerto 10000"
echo -e "Pruebas (Dev):    Puerto 10001"
docker ps | grep fiscalio

echo -e "${GREEN}Recuerda configurar Cloudflare Tunnel para apuntar test-api.fiscalio.cloud a localhost:10001${NC}"
