<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddGlobalInfoToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('global_periodicidad', 2)->nullable();
            $table->string('global_meses', 2)->nullable();
            $table->integer('global_year')->nullable();
            $table->dateTime('fecha_fiscal')->nullable()->index();
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
            $table->dropColumn(['global_periodicidad', 'global_meses', 'global_year', 'fecha_fiscal']);
        });
    }
}
