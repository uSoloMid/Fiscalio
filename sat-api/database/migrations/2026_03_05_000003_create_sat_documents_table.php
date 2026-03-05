<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sat_documents', function (Blueprint $table) {
            $table->id();
            $table->string('rfc', 13)->index();
            $table->enum('type', ['csf', 'opinion_32d']);
            $table->string('file_path', 500);
            $table->unsignedInteger('file_size')->nullable();
            $table->timestamp('requested_at');
            $table->timestamps();

            $table->foreign('rfc')->references('rfc')->on('businesses')->onDelete('cascade');
            $table->index(['rfc', 'type', 'requested_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sat_documents');
    }
};
