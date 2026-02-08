<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddExtraSatStatusToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('es_cancelable')->nullable()->after('estado_sat_updated_at');
            $table->string('estatus_cancelacion')->nullable()->after('es_cancelable');
            $table->string('validacion_efos')->nullable()->after('estatus_cancelacion');
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
            $table->dropColumn(['es_cancelable', 'estatus_cancelacion', 'validacion_efos']);
        });
    }
}
