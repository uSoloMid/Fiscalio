<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_movement_cfdis', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_movement_id')->constrained('bank_movements')->onDelete('cascade');
            $table->foreignId('cfdi_id')->constrained('cfdis')->onDelete('cascade');
            $table->string('confidence', 10)->nullable();
            $table->timestamp('created_at')->nullable();
            $table->unique(['bank_movement_id', 'cfdi_id']);
        });

        // Migrate existing 1:1 assignments to the new junction table
        DB::statement("
            INSERT INTO bank_movement_cfdis (bank_movement_id, cfdi_id, confidence, created_at)
            SELECT id, cfdi_id, confidence, COALESCE(reconciled_at, updated_at)
            FROM bank_movements
            WHERE cfdi_id IS NOT NULL
        ");
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_movement_cfdis');
    }
};
