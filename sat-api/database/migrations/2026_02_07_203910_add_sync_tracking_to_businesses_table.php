<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSyncTrackingToBusinessesTable extends Migration
{
    public function up()
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dateTime('last_sync_at')->nullable();
            $table->dateTime('last_verification_at')->nullable();
            $table->boolean('is_syncing')->default(false);
            $table->string('sync_status')->nullable(); // e.g., 'idle', 'error', 'running'
        });
    }

    public function down()
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dropColumn(['last_sync_at', 'last_verification_at', 'is_syncing', 'sync_status']);
        });
    }
}
