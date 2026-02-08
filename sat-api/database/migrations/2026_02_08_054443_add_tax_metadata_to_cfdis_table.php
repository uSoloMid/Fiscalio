<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTaxMetadataToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('regimen_fiscal_emisor', 5)->nullable()->after('rfc_emisor');
            $table->string('regimen_fiscal_receptor', 5)->nullable()->after('rfc_receptor');
            $table->string('domicilio_fiscal_receptor', 10)->nullable()->after('regimen_fiscal_receptor');
            $table->string('exportacion', 5)->nullable()->after('tipo');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->dropColumn(['regimen_fiscal_emisor', 'regimen_fiscal_receptor', 'domicilio_fiscal_receptor', 'exportacion']);
        });
    }
}
