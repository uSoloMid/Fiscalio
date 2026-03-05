<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class DatabaseRestore extends Command
{
    protected $signature = 'db:restore {--backup= : Nombre específico del backup (opcional)}';

    protected $description = 'Restaura la base de datos desde el backup más reciente (o uno específico)';

    public function handle()
    {
        $dbPath    = '/var/www/Base_datos/database.sqlite';
        $backupDir = '/var/www/Base_datos/backups';

        // Listar backups disponibles
        $backupName = $this->option('backup');

        if ($backupName) {
            $backupFile = "$backupDir/$backupName";
            if (!File::exists($backupFile)) {
                $this->error("Backup no encontrado: $backupFile");
                return 1;
            }
        } else {
            // Seleccionar el más reciente automáticamente
            $files = File::files($backupDir);
            $backups = [];
            foreach ($files as $file) {
                $filename = $file->getFilename();
                if ($filename === 'database_PERMANENT.sqlite') continue;
                if (str_starts_with($filename, 'backup_') && $file->getExtension() === 'sqlite') {
                    $backups[] = [
                        'path' => $file->getPathname(),
                        'name' => $filename,
                        'time' => $file->getMTime(),
                    ];
                }
            }

            if (empty($backups)) {
                $this->error("No hay backups disponibles en $backupDir");
                return 1;
            }

            usort($backups, fn($a, $b) => $b['time'] - $a['time']);
            $backupFile = $backups[0]['path'];

            $this->line("Backups disponibles:");
            foreach (array_slice($backups, 0, 5) as $i => $b) {
                $marker = $i === 0 ? ' <-- (más reciente)' : '';
                $this->line("  [{$i}] {$b['name']} (" . date('Y-m-d H:i:s', $b['time']) . ")$marker");
            }
            $this->newLine();
        }

        $this->warn("Se va a restaurar desde: " . basename($backupFile));
        $this->warn("Esto REEMPLAZARÁ la base de datos actual.");

        if (!$this->option('no-interaction') && !$this->confirm('¿Continuar?')) {
            $this->info('Operación cancelada.');
            return 0;
        }

        // Crear backup de seguridad del estado actual antes de restaurar
        $safetyBackup = $backupDir . '/pre_restore_' . date('Ymd_His') . '.sqlite';
        exec("sqlite3 $dbPath \".backup '$safetyBackup'\"", $out, $code);
        if ($code === 0) {
            $this->info("Backup de seguridad creado: " . basename($safetyBackup));
        }

        // Restaurar
        exec("sqlite3 $dbPath \".restore '$backupFile'\"", $out, $code);

        if ($code === 0) {
            $this->info("Base de datos restaurada exitosamente desde: " . basename($backupFile));
            Log::warning("DB restaurada manualmente desde: " . basename($backupFile));
            return 0;
        } else {
            $this->error("Error al restaurar la base de datos.");
            Log::error("Fallo al restaurar DB desde: " . basename($backupFile));
            return 1;
        }
    }
}
