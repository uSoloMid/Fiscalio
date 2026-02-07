<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSatStatusColumnsToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('estado_sat')->nullable()->after('request_id');
            $table->boolean('es_cancelado')->nullable()->default(0)->after('estado_sat');
            $table->dateTime('fecha_cancelacion')->nullable()->after('es_cancelado');
            $table->dateTime('estado_sat_updated_at')->nullable()->after('fecha_cancelacion');
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
            $table->dropColumn([
                'estado_sat',
                'es_cancelado',
                'fecha_cancelacion',
                'estado_sat_updated_at'
            ]);
        });
    }
}
