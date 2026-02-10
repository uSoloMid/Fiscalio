<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCfdiPaymentsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('cfdi_payments', function (Blueprint $table) {
            $table->id();
            $table->string('uuid_pago', 36)->index();
            $table->string('uuid_relacionado', 36)->index();
            $table->dateTime('fecha_pago')->index();
            $table->decimal('monto_pagado', 18, 2);
            $table->integer('num_parcialidad')->nullable();
            $table->decimal('saldo_anterior', 18, 2)->nullable();
            $table->decimal('saldo_insoluto', 18, 2)->nullable();
            $table->string('moneda_pago', 10)->nullable();
            $table->decimal('tipo_cambio_pago', 18, 4)->default(1);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('cfdi_payments');
    }
}
