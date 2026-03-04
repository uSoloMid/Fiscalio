<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_notes', function (Blueprint $table) {
            $table->id();
            $table->string('rfc', 13)->index();
            $table->string('type', 30); // coverage_gap, credential_error, expired_fiel, sat_error, info
            $table->string('title', 200);
            $table->text('body');
            $table->string('invoice_type', 10)->nullable(); // issued, received, null = both
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->foreign('rfc')->references('rfc')->on('businesses')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_notes');
    }
};
