<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddNifAndSatAgrupadorToAccountsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('accounts', 'nif_rubro')) {
                $table->string('nif_rubro')->nullable()->after('naturaleza');
            }
            if (!Schema::hasColumn('accounts', 'sat_agrupador')) {
                $table->string('sat_agrupador')->nullable()->after('nif_rubro');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn(['nif_rubro', 'sat_agrupador']);
        });
    }
}
