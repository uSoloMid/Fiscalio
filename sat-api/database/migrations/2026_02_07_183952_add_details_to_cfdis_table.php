<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDetailsToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->string('concepto')->nullable()->after('tipo');
            $table->decimal('iva', 18, 2)->default(0)->after('total');
            $table->decimal('retenciones', 18, 2)->default(0)->after('iva');
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
            $table->dropColumn(['concepto', 'iva', 'retenciones']);
        });
    }
}
