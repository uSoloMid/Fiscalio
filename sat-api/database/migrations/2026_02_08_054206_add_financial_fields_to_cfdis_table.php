<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddFinancialFieldsToCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->decimal('subtotal', 18, 2)->default(0)->after('tipo');
            $table->decimal('descuento', 18, 2)->default(0)->after('subtotal');
            $table->string('moneda', 10)->nullable()->after('total');
            $table->decimal('tipo_cambio', 18, 4)->default(1)->after('moneda');
            $table->string('forma_pago', 5)->nullable()->after('metodo_pago');
            $table->string('uso_cfdi', 5)->nullable()->after('forma_pago');
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
            $table->dropColumn(['subtotal', 'descuento', 'moneda', 'tipo_cambio', 'forma_pago', 'uso_cfdi']);
        });
    }
}
