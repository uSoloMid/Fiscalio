# CONTEXTO GENERAL DEL PROYECTO FISCALIO

Este documento es la fuente de verdad para cualquier IA que trabaje en este repositorio. Contiene el contexto operativo, credenciales y reglas críticas de arquitectura.

## 1. INFRAESTRUCTURA Y DESPLIEGUE
- **Backend**: Laravel 10+, PHP 8.2+.
- **Frontend**: React (Vite, TypeScript, Tailwind CSS).
- **Servidor de Producción**: Mini PC Linux (Ubuntu) en la red local.
- **IP Servidor**: `192.168.100.97`
- **Usuario SSH**: `fiscalio`
- **Contraseña SSH/Sudo**: `Solomid8`
- **Arquitectura de Ejecución**: El backend corre dentro de un contenedor Docker llamado `api`. No está expuesto directamente, se gestiona mediante comandos `docker exec`.
- **Base de Datos**: SQLite centralizada en `C:\Fiscalio\Base_datos` (Windows) y mapeada al volumen del contenedor en producción.

## 2. FLUJO DE TRABAJO OBLIGATORIO (DEPLOY)
Cada vez que realices un cambio en el backend (`sat-api`), debes seguir este flujo exacto:
1.  **Git Local**: `git add .`, `git commit -m "descripción"`, `git push origin main`.
2.  **Sincronización Dev** (Opcional pero recomendado): `git checkout dev`, `git merge main`, `git push origin dev`, volver a `main`.
3.  **Actualización Servidor**:
    - Conectar vía SSH: `ssh fiscalio@192.168.100.97`
    - Comandos:
      ```bash
      cd ~/Fiscalio
      git pull origin main
      docker restart api
      ```
4.  **Verificación**: `docker logs api --tail 50`.

## 3. REGLAS CRÍTICAS DE PROGRAMACIÓN
- **Codificación**: Los archivos PHP **DEBEN** guardarse en **UTF-8 SIN BOM**. El BOM causa errores fatales en el cargado de clases.
- **Rutas**: En Windows, usa siempre rutas absolutas (ej. `c:\Fiscalio\sat-api\...`).
- **Fecha Fiscal**: Para el módulo de **Control Provisional**, la fecha contable principal es la **Fecha de Timbrado** (nodo `TimbreFiscalDigital`) o el nodo de `InformacionGlobal`.
- **Transparencia**: El usuario exige ver el 100% de la información en desgloses (incluyendo facturas no deducibles o excluidas) para poder auditarlas manualmente.

## 4. ESTADO ACTUAL (17 de Febrero, 2026)
- **Módulo Control Provisional**: Se ha corregido el desglose detallado. Ahora soporta clics en etiquetas generales y desglosa correctamente por método (PUE, PPD, REP).
- **Procesador XML**: Se eliminó la lógica que sobrescribía la fecha fiscal basándose en el nodo de Información Global. Ahora se respeta estrictamente la fecha de emisión del XML para la categorización mensual.
- **Exportación Excel**: Se implementó la funcionalidad de exportar facturas a Excel con selección de columnas personalizada.
- **Base de Datos**: Se configuró `.gitignore` para ignorar la carpeta `Base_datos` y prevenir conflictos en despliegues.
- **Vercel Deploy**: Se corrigió un error de TypeScript en `ProvisionalControlPage.tsx` que impedía el build en Vercel.
- **Corrección de Fechas**: Se ejecutó un script de reparación en el servidor (`fix_dates.php`) que corrigió 47 facturas (incluyendo las de "Público en General") para que coincidan estrictamente con su fecha de emisión.
- **Corrección Exportación**: Se ajustó la prioridad de rutas en la API para corregir el error 404 al exportar Excel.
- **Pendiente**: Monitorear que las nuevas facturas se inserten correctamente (validado por lógica actual).

---
**IMPORTANTE**: Si eres una IA, lee este archivo antes de sugerir cualquier cambio. Al terminar tu tarea, actualiza la sección "ESTADO ACTUAL".
