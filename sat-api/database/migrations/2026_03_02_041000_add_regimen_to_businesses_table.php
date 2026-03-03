<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration 
{
    public function up()
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->string('regimen_fiscal', 10)->nullable()->after('rfc');
            $table->string('tipo_persona', 2)->nullable()->after('regimen_fiscal'); // M (Moral), F (Física)
        });
    }

    public function down()
    {
        Schema::table('businesses', function (Blueprint $table) {
            $table->dropColumn(['regimen_fiscal', 'tipo_persona']);
        });
    }
};
