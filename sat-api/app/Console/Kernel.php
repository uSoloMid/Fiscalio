<?php

declare(strict_types = 1)
;

namespace App\Console;

use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * The Artisan commands provided by your application.
     *
     * @var array<string>
     */
    protected $commands = [];

    protected function schedule($schedule)
    {
        // Heartbeat para verificar que el worker está corriendo en Render
        $schedule->call(function () {
            \Log::info('Scheduler Heartbeat (SAT Worker Active)');
        })->everyMinute();

        // Orquestador de tareas del SAT (Sincronización + Verificación)
        // Ejecución serial cada 15 minutos para evitar bloqueos de SQLite
        $schedule->command('sat:run-jobs')
            ->everyFifteenMinutes()
            ->withoutOverlapping();

        // Respaldo de base de datos cada 12 horas
        $schedule->command('db:backup')
            ->twiceDaily(0, 12);
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
