<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_selections', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 30)->index();
            $table->string('type', 20);          // csf | opinion_32d
            $table->json('options');              // [{rfc, name}]
            $table->timestamp('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_selections');
    }
};
