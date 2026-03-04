<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_movements', function (Blueprint $table) {
            $table->string('confidence', 10)->nullable()->after('is_reviewed');
            $table->timestamp('reconciled_at')->nullable()->after('confidence');
        });
    }

    public function down(): void
    {
        Schema::table('bank_movements', function (Blueprint $table) {
            $table->dropColumn(['confidence', 'reconciled_at']);
        });
    }
};
