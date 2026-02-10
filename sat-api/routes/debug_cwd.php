<?php
use Illuminate\Support\Facades\Route;

Route::get('/debug-cwd', function () {
    return [
    'cwd' => getcwd(),
    'base_path' => base_path(),
    'app_path' => app_path(),
    ];
});
