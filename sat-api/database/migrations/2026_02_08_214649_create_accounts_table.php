<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration 
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('internal_code', 20)->unique(); // Formato AAA-BB-CCC
            $table->string('sat_code', 20); // Formato con puntos (102.01)
            $table->string('name');
            $table->integer('level'); // 1, 2, 3
            $table->string('type'); // Activo, Pasivo, Capital, Ingresos, Egresos
            $table->enum('naturaleza', ['Deudora', 'Acreedora']);
            $table->string('parent_code')->nullable();
            $table->boolean('is_selectable')->default(true); // Si puede recibir cargos/abonos
            $table->timestamps();

            $table->index('sat_code');
            $table->index('internal_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
