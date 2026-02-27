<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateBankStatementsAndMovementsTables extends Migration
{
    public function up()
    {
        Schema::create('bank_statements', function (Blueprint $blueprint) {
            $blueprint->id();
            $blueprint->foreignId('business_id')->constrained('businesses')->onDelete('cascade');
            $blueprint->string('bank_name');
            $blueprint->string('account_number')->nullable();
            $blueprint->string('period')->nullable(); // e.g., "JAN-2026"
            $blueprint->decimal('total_cargos', 15, 2)->default(0);
            $blueprint->decimal('total_abonos', 15, 2)->default(0);
            $blueprint->decimal('initial_balance', 15, 2)->default(0);
            $blueprint->decimal('final_balance', 15, 2)->default(0);
            $blueprint->string('file_name')->nullable();
            $blueprint->timestamps();
        });

        Schema::create('bank_movements', function (Blueprint $blueprint) {
            $blueprint->id();
            $blueprint->foreignId('bank_statement_id')->constrained('bank_statements')->onDelete('cascade');
            $blueprint->date('date');
            $blueprint->text('description');
            $blueprint->string('reference')->nullable();
            $blueprint->decimal('cargo', 15, 2)->default(0);
            $blueprint->decimal('abono', 15, 2)->default(0);
            $blueprint->decimal('saldo', 15, 2)->default(0);
            $blueprint->integer('cfdi_id')->nullable(); // Future link to cfdis table
            $blueprint->integer('account_id')->nullable(); // Future link to accounts table
            $blueprint->boolean('is_reviewed')->default(false);
            $blueprint->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('bank_movements');
        Schema::dropIfExists('bank_statements');
    }
}
