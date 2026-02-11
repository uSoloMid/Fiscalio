<?php

namespace App\Console\Commands;

use App\Models\Cfdi;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class MigrateVaultStructure extends Command
{
    protected $signature = 'vault:migrate-legacy';
    protected $description = 'Migra archivos de la estructura antigua a la nueva estructura Vault';

    public function handle()
    {
        $this->info("Iniciando migración de Vault...");

        $sourceBase = 'C:\\Fiscalio\\sat-api\\storage\\app';
        $vaultBase = 'C:\\Fiscalio\\Base_datos\\vault';

        if (!File::exists($sourceBase)) {
            $this->error("No se encuentra el directorio fuente: $sourceBase");
            return 1;
        }

        $cfdis = Cfdi::all();
        $count = 0;
        $errors = 0;

        foreach ($cfdis as $cfdi) {
            $uuid = strtoupper($cfdi->uuid);
            $filename = $uuid . '.xml';

            // Intentar encontrar el archivo en varias rutas probables
            // 1. Ruta guardada en DB (relativa a sourceBase)
            $pathsToCheck = [];
            if ($cfdi->path_xml) {
                $pathsToCheck[] = $sourceBase . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $cfdi->path_xml);
            }

            // 2. Ruta antigua probable: sat/xml/RFC/Year/Type/Month/UUID.xml
            // Type puede ser emitidas/recibidas/otros
            $types = ['emitidas', 'recibidas', 'otros'];
            $rfcEmisor = $cfdi->rfc_emisor;
            $rfcReceptor = $cfdi->rfc_receptor;
            $year = $cfdi->fecha->format('Y');
            $month = $cfdi->fecha->format('m');

            foreach ($types as $t) {
                // Check RFC Emisor as client
                $pathsToCheck[] = "$sourceBase\\sat\\xml\\$rfcEmisor\\$year\\$t\\$month\\$filename";
                // Check RFC Receptor as client
                $pathsToCheck[] = "$sourceBase\\sat\\xml\\$rfcReceptor\\$year\\$t\\$month\\$filename";
            }

            // 3. Ruta nueva probable (si ya se movió parcialmente): Type/RFC/Year/Month...
            foreach ($types as $t) {
                $pathsToCheck[] = "$sourceBase\\$t\\$rfcEmisor\\$year\\$month\\$filename";
                $pathsToCheck[] = "$sourceBase\\$t\\$rfcReceptor\\$year\\$month\\$filename";
            }

            $foundPath = null;
            foreach ($pathsToCheck as $p) {
                if (File::exists($p)) {
                    $foundPath = $p;
                    break;
                }
            }

            if (!$foundPath) {
                $this->warn("No se encontró el XML para UUID: $uuid");
                $errors++;
                continue;
            }

            // Determinar el destino correcto: vault/{emitidas|recibidas}/RFC_CLIENTE/YYYY/MM/UUID.xml
            // Necesitamos saber quién es el cliente.
            // Extraer RFC del path encontrado si es posible
            $relativePath = str_replace($sourceBase . DIRECTORY_SEPARATOR, '', $foundPath);
            $parts = explode(DIRECTORY_SEPARATOR, $relativePath);

            $rfcCliente = null;
            // Estructura antigua: sat/xml/RFC/...
            if (isset($parts[0]) && $parts[0] == 'sat' && isset($parts[2])) {
                $rfcCliente = $parts[2];
            }
            // Estructura nueva o intermedia: emitidas/RFC/...
            elseif (isset($parts[1]) && strlen($parts[1]) >= 12) {
                $rfcCliente = $parts[1]; // partes[0] es tipo
            }

            if (!$rfcCliente) {
                // Fallback: Si no podemos deducir el cliente del path, usamos el emisor por defecto
                // pero esto podría ser incorrecto si es una factura recibida.
                // Sin business_id en cfdis table, es difícil saber quién bajó la factura si no está en el path.
                // Asumiremos que si es recibida por uno de "nuestros" RFCs, ese es el cliente.
                // Pero no sabemos cuales son "nuestros" RFCs facilmente aqui sin consultar Business table.

                // Consultar Business table para ver si emisor o receptor son nuestros clientes
                $isEmisorClient = \App\Models\Business::where('rfc', $rfcEmisor)->exists();
                $isReceptorClient = \App\Models\Business::where('rfc', $rfcReceptor)->exists();

                if ($isEmisorClient)
                    $rfcCliente = $rfcEmisor;
                elseif ($isReceptorClient)
                    $rfcCliente = $rfcReceptor;
                else
                    $rfcCliente = $rfcEmisor; // Default
            }

            // Determinar tipo carpeta (emitidas vs recibidas)
            $folderType = ($rfcEmisor === $rfcCliente) ? 'emitidas' : 'recibidas';

            // Destino Final
            $newRelPath = "$folderType/$rfcCliente/$year/$month/$filename";
            $destFile = $vaultBase . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $newRelPath);

            // Copiar si no existe ya
            if (!File::exists($destFile)) {
                if (!File::exists(dirname($destFile))) {
                    File::makeDirectory(dirname($destFile), 0755, true);
                }
                File::copy($foundPath, $destFile);
            }

            // Actualizar DB siempre a la nueva ruta relativa
            $cfdi->path_xml = $newRelPath;
            $cfdi->save();

            $count++;
        }

        $this->info("Migración completada. Procesados: $count. Errores (no encontrados): $errors");
        return 0;
    }
}
