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
        Schema::table('accounts', function (Blueprint $table) {
            $table->boolean('is_postable')->default(false)->after('is_selectable'); // Cuentas de detalle/movimiento
            $table->boolean('generate_auxiliaries')->default(false)->after('is_postable'); // Clientes/Proveedores
            $table->string('currency', 3)->default('MXN')->after('generate_auxiliaries');
            $table->boolean('is_cash_flow')->default(false)->after('currency');
            $table->boolean('is_active')->default(true)->after('is_cash_flow');
            $table->text('description')->nullable()->after('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn([
                'is_postable',
                'generate_auxiliaries',
                'currency',
                'is_cash_flow',
                'is_active',
                'description'
            ]);
        });
    }
};
