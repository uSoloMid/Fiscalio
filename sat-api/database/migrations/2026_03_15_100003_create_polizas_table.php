<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('polizas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            // Origen: movimiento bancario O CFDI (uno de los dos, o ambos)
            $table->foreignId('bank_movement_id')->nullable()->constrained('bank_movements')->nullOnDelete();
            $table->foreignId('cfdi_id')->nullable()->constrained('cfdis')->nullOnDelete();
            $table->foreignId('template_id')->nullable()->constrained('poliza_templates')->nullOnDelete();
            // Datos de la póliza
            $table->tinyInteger('tipo_poliza');       // 1=Ingreso 2=Egreso 3=Diario
            $table->integer('numero');
            $table->date('fecha');
            $table->string('concepto', 200);
            $table->string('status')->default('draft'); // draft | exported
            $table->timestamp('exported_at')->nullable();
            $table->timestamps();
        });

        Schema::create('poliza_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poliza_id')->constrained()->cascadeOnDelete();
            $table->integer('sort_order');
            $table->foreignId('account_id')->constrained('accounts');
            $table->tinyInteger('tipo_movto');        // 0=Cargo 1=Abono
            $table->decimal('importe', 15, 2);
            $table->string('concepto', 200)->nullable();
            $table->string('uuid_cfdi', 36)->nullable(); // para fila AD en el TXT
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poliza_lines');
        Schema::dropIfExists('polizas');
    }
};
