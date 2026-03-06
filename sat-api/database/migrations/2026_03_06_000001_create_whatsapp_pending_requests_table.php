<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_pending_requests', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 30);       // E.164 format e.g. 521XXXXXXXXXX
            $table->string('rfc', 20)->index();
            $table->string('type', 20);        // csf | opinion_32d
            $table->timestamp('requested_at')->useCurrent();
            $table->timestamp('sent_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_pending_requests');
    }
};
