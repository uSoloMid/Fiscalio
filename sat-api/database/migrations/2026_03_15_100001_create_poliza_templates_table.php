<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poliza_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->cascadeOnDelete();
            $table->string('name');                    // "Provisión Venta", "Cobro", etc.
            $table->tinyInteger('tipo_poliza');        // 1=Ingreso 2=Egreso 3=Diario
            $table->string('concepto_template')->nullable(); // ej: "VENTA {rfc} {fecha}"
            $table->string('trigger_type');            // 'cfdi' | 'movement'
            $table->string('cfdi_tipo')->nullable();   // 'I'|'E'|'P'|'N' cuando trigger=cfdi
            $table->string('cfdi_role')->nullable();   // 'emisor'|'receptor' — nuestro rol en el CFDI
            $table->string('movement_direction')->nullable(); // 'cargo'|'abono' cuando trigger=movement
            $table->timestamps();
        });

        Schema::create('poliza_template_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('poliza_templates')->cascadeOnDelete();
            $table->integer('sort_order');
            $table->tinyInteger('tipo_movto');         // 0=Cargo(Debe) 1=Abono(Haber)
            // Fuente de la cuenta contable
            $table->string('account_source');
            // 'fixed'        → usar account_id directo
            // 'rfc_cliente'  → buscar RFC contraparte en rfc_account_maps
            // 'rfc_proveedor'→ buscar RFC contraparte en rfc_account_maps
            // 'banco'        → buscar banco del estado de cuenta en bank_account_maps
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();
            // Fuente del importe
            $table->string('importe_source');
            // 'cfdi_total' | 'cfdi_subtotal' | 'cfdi_iva'
            // 'cfdi_retencion_isr' | 'cfdi_retencion_iva'
            // 'movement_amount' (cargo o abono del movimiento bancario)
            $table->string('concepto_line')->nullable();
            $table->boolean('is_optional')->default(false); // si importe=0, se omite
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poliza_template_lines');
        Schema::dropIfExists('poliza_templates');
    }
};
