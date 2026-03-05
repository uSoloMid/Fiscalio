<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reconciliation_patterns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_id')->constrained()->onDelete('cascade');
            // Extracted counterpart keyword from bank description (e.g. "APCE AGRO" from SPEI)
            $table->string('description_keyword', 80);
            // RFC of the CFDI counterpart that was manually confirmed
            $table->string('counterpart_rfc', 20);
            $table->integer('confirmed_count')->default(1);
            $table->timestamps();

            $table->unique(['business_id', 'description_keyword', 'counterpart_rfc']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reconciliation_patterns');
    }
};
