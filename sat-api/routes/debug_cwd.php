<?php
use Illuminate\Support\Facades\Route;

Route::get('/debug-cwd', function () {
    return [
    'now' => now()->toIso8601String(),
    'cwd' => getcwd(),
    'base_path' => base_path(),
    'db_path' => config('database.connections.sqlite.database'),
    'env_db' => env('DB_DATABASE'),
    ];
});
