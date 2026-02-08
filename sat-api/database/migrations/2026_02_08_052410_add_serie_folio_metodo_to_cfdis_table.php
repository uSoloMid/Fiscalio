<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSerieFolioMetodoToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('serie')->nullable()->after('uuid');
            $table->string('folio')->nullable()->after('serie');
            $table->string('metodo_pago', 10)->nullable()->after('tipo');
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
            $table->dropColumn(['serie', 'folio', 'metodo_pago']);
        });
    }
}
