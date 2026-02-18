# FLUJO DE TRABAJO GIT Y DEPLOY

Este documento define cómo trabajamos con Ramas y Vercel para mantener la estabilidad del Servidor Mini PC y permitir pruebas seguras en la nube.

## 1. Ramas (Branches)

- **`main` (Producción)**  
  - ES SAGRADA. Lo que está aquí es lo que corre en el Servidor Mini PC del cliente.
  - Solo se actualiza cuando una funcionalidad está 100% probada en `dev`.
  - La sincronizan el servidor y el cliente Windows.

- **`dev` (Desarrollo/Staging)**  
  - AQUÍ SE TRABAJA.
  - Vercel despliega automáticamente cada commit de esta rama a un entorno de "Preview".
  - **ADVERTENCIA CRÍTICA**: Vercel apunta a la API de producción (`api.fiscalio.cloud`). 
  - **CUIDADO**: Cualquier cambio de datos (borrar/crear facturas) en Vercel **SE REFLEJA EN LA MINI PC REAL**.


## 2. Flujo de Trabajo (Workflow)

1.  **Empezar Tarea**:
    ```powershell
    git checkout dev
    git pull origin dev
    ```
2.  **Desarrollar**: Haz tus cambios, pruebas locales, etc.
3.  **Guardar Cambios**:
    ```powershell
    git add .
    git commit -m "feat: nueva funcionalidad x"
    git push origin dev
    ```
    *(Aquí Vercel generará un link de preview para probar en la nube si es necesario)*

4.  **Lanzar a Producción (Mini PC)**:
    Solo cuando todo esté listo:
    ```powershell
    git checkout main
    git merge dev
    git push origin main
    git checkout dev
    ```
    Luego, conéctate al servidor para actualizarlo:
    ```powershell
    ssh fiscalio@...
    cd ~/Fiscalio
    git pull origin main
    docker restart api
    ```

## 3. Reglas de Oro
- Nunca hagas commit directo a `main` a menos que sea un "Hotfix" urgente (algo roto en producción).
- Mantén `dev` siempre actualizada con `main` si alguien más hace cambios.
