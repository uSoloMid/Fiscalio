<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sat_documents', function (Blueprint $table) {
            // 'positive' | 'negative' | null (unknown / not yet parsed)
            $table->string('opinion_result', 20)->nullable()->after('file_size');
        });
    }

    public function down(): void
    {
        Schema::table('sat_documents', function (Blueprint $table) {
            $table->dropColumn('opinion_result');
        });
    }
};
