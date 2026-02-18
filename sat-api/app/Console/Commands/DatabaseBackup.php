<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

class DatabaseBackup extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:backup';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Backup SQLite database every 12 hours and keep recent ones';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $dbPath = '/var/www/Base_datos/database.sqlite';
        $backupDir = '/var/www/Base_datos/backups';

        if (!File::exists($backupDir)) {
            File::makeDirectory($backupDir, 0755, true);
        }

        $timestamp = date('Ymd_His');
        $backupFile = "$backupDir/backup_$timestamp.sqlite";

        $this->info("Creating backup at $backupFile...");

        // Use sqlite3 .backup for a safe hot backup
        exec("sqlite3 $dbPath \".backup '$backupFile'\"", $output, $resultCode);

        if ($resultCode === 0) {
            $this->info("Backup created successfully.");
            Log::info("Database backup created: backup_$timestamp.sqlite");
        }
        else {
            $this->error("Failed to create backup.");
            Log::error("Database backup failed.");
            return 1;
        }

        // Retention logic: 
        // 1. Minimum 3 backups.
        // 2. Delete if older than 48 hours.
        $files = File::files($backupDir);
        $backups = [];
        foreach ($files as $file) {
            $filename = $file->getFilename();
            // Ignore the permanent backup
            if ($filename === 'database_PERMANENT.sqlite') {
                continue;
            }

            if (str_starts_with($filename, 'backup_') && $file->getExtension() === 'sqlite') {
                $backups[] = [
                    'path' => $file->getPathname(),
                    'time' => $file->getMTime()
                ];
            }
        }

        // Sort by time descending (newest first)
        usort($backups, function ($a, $b) {
            return $b['time'] - $a['time'];
        });

        $now = time();
        $fortyEightHoursAgo = $now - (48 * 3600);

        foreach ($backups as $index => $backup) {
            // Keep at least 3 most recent backups regardless of time
            if ($index < 3) {
                continue;
            }

            // If it's the 4th or more, check if it's older than 48h
            if ($backup['time'] < $fortyEightHoursAgo) {
                $this->info("Deleting old backup (retention policy): " . basename($backup['path']));
                File::delete($backup['path']);
            }
        }

        return 0;
    }
}
