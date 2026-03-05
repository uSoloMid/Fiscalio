<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class DatabaseHealthCheck extends Command
{
    protected $signature = 'db:health-check';

    protected $description = 'Verifica integridad crítica de la BD. Si detecta pérdida de datos, restaura automáticamente.';

    private string $dbPath    = '/var/www/Base_datos/database.sqlite';
    private string $backupDir = '/var/www/Base_datos/backups';
    private string $snapshotFile = '/var/www/Base_datos/backups/health_snapshot.json';

    public function handle()
    {
        $businesses = DB::table('businesses')->count();
        $cfdis      = DB::table('cfdis')->count();

        // Guardar snapshot del estado actual si es el primero o hay datos
        if ($businesses > 0) {
            $this->saveSnapshot($businesses, $cfdis);
            $this->info("Health OK — businesses: $businesses, cfdis: $cfdis");
            return 0;
        }

        // businesses = 0: posible pérdida de datos
        $snapshot = $this->loadSnapshot();

        if ($snapshot === null) {
            // Nunca tuvimos datos registrados, no hay referencia
            $this->info("Health OK (sin snapshot previo) — businesses: 0");
            return 0;
        }

        // Había datos antes → esto es una anomalía crítica
        Log::critical("HEALTH CHECK: businesses=0 detectado. Último snapshot: " . json_encode($snapshot) . ". Iniciando auto-restore.");
        $this->error("ALERTA: Base de datos sin clientes. Snapshot anterior tenía {$snapshot['businesses']} businesses. Restaurando...");

        $result = $this->autoRestore();

        if ($result === 0) {
            $businessesNow = DB::table('businesses')->count();
            Log::warning("Auto-restore completado. businesses ahora: $businessesNow");
            $this->info("Restauración exitosa. businesses ahora: $businessesNow");
        } else {
            Log::critical("Auto-restore FALLIDO. Intervención manual requerida.");
            $this->error("Restauración fallida. Se requiere intervención manual.");
        }

        return $result;
    }

    private function saveSnapshot(int $businesses, int $cfdis): void
    {
        $data = [
            'businesses' => $businesses,
            'cfdis'      => $cfdis,
            'updated_at' => now()->toISOString(),
        ];

        File::put($this->snapshotFile, json_encode($data));
    }

    private function loadSnapshot(): ?array
    {
        if (!File::exists($this->snapshotFile)) {
            return null;
        }

        $data = json_decode(File::get($this->snapshotFile), true);
        return is_array($data) ? $data : null;
    }

    private function autoRestore(): int
    {
        // Buscar el backup más reciente
        if (!File::isDirectory($this->backupDir)) {
            $this->error("Directorio de backups no existe: {$this->backupDir}");
            return 1;
        }

        $files = File::files($this->backupDir);
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
            $this->error("No hay backups disponibles para restaurar.");
            return 1;
        }

        usort($backups, fn($a, $b) => $b['time'] - $a['time']);
        $backupFile = $backups[0]['path'];

        $this->info("Restaurando desde: " . basename($backupFile));

        // Backup de seguridad del estado corrupto (por si acaso)
        $safetyPath = $this->backupDir . '/pre_autorestore_' . date('Ymd_His') . '.sqlite';
        exec("sqlite3 {$this->dbPath} \".backup '$safetyPath'\"");

        // Restaurar
        exec("sqlite3 {$this->dbPath} \".restore '$backupFile'\"", $out, $code);

        return $code === 0 ? 0 : 1;
    }
}
