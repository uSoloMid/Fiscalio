<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Artisan;

return new class extends Migration 
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Fuerza el reinicio de todos los catálogos de los 51 clientes
        Artisan::call('accounts:reset-from-excel');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
    //
    }
};
