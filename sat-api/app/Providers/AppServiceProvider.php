<?php

declare(strict_types = 1)
;

namespace App\Providers;

use Faker\Generator as FakerGenerator;
use Illuminate\Support\ServiceProvider;
use PhpCfdi\Rfc\RfcFaker;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->extend(FakerGenerator::class , function (FakerGenerator $generator) {
            $generator->addProvider(new RfcFaker());
            return $generator;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (config('database.default') === 'sqlite') {
            try {
                \Illuminate\Support\Facades\DB::statement('PRAGMA journal_mode=WAL;');
                \Illuminate\Support\Facades\DB::statement('PRAGMA busy_timeout=5000;');
                \Illuminate\Support\Facades\DB::statement('PRAGMA synchronous=NORMAL;');
            }
            catch (\Exception $e) {
            // Ignore if DB not ready
            }
        }
    }
}
