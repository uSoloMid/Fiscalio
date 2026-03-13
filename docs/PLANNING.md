# Planeación de Tareas

## Tarea activa: Módulo de Cuentas — Visual feedback + Export Contpaqi + Fix import

### Objetivo
- Catálogo ya es por cliente (business_id) — solo necesita mantenerse así
- Fix visual: cuentas seleccionadas/expandidas deben resaltarse (negrita/color)
- Export Excel en formato Contpaqi para importar de vuelta en Contpaqi
- Fix importExcel: saltar 4 filas de encabezado (igual que seedCatalog)

### Archivos a modificar
- `sat-api/app/Http/Controllers/AccountController.php` — agregar exportExcel, fix importExcel
- `sat-api/routes/api.php` — agregar ruta GET /accounts/export
- `ui/src/services.ts` — agregar exportAccountsExcel()
- `ui/src/pages/AccountsPage.tsx` — visual feedback árbol + botón export Excel

### Pasos
- [ ] Actualizar PLANNING.md
- [ ] Backend: método exportExcel (PhpSpreadsheet, formato Contpaqi, 4 header rows)
- [ ] Backend: corregir importExcel (saltar $idx < 4 en lugar de 1 fila)
- [ ] Backend: ruta GET /accounts/export
- [ ] Frontend: exportAccountsExcel() en services.ts
- [ ] Frontend: visual feedback árbol (selected + ancestor highlighting)
- [ ] Frontend: botón "Exportar Excel" reemplaza botón CSV
- [ ] Deploy
