<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // RFC de contraparte → cuenta contable (por empresa)
        // Sirve para: Clientes (emisor de facturas), Proveedores (receptor de facturas)
        Schema::create('rfc_account_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            $table->string('rfc', 20);
            $table->string('nombre')->nullable();
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['business_id', 'rfc']);
        });

        // Banco (estado de cuenta) → cuenta contable bancaria en ContPAQi
        Schema::create('bank_account_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            // Puede ligarse a un statement específico o a banco+cuenta genérico
            $table->foreignId('bank_statement_id')->nullable()->constrained('bank_statements')->nullOnDelete();
            $table->string('bank_name')->nullable();
            $table->string('account_number', 30)->nullable(); // últimos 4 dígitos o cuenta completa
            $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_account_maps');
        Schema::dropIfExists('rfc_account_maps');
    }
};
