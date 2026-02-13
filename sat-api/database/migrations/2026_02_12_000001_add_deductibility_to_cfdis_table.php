<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDeductibilityToCfdisTable extends Migration
{
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->boolean('is_deductible')->default(true)->after('es_cancelado');
            $table->string('deduction_type')->nullable()->after('is_deductible'); // e.g. 'gastos', 'personal', 'no_deducible'
        });
    }

    public function down()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->dropColumn(['is_deductible', 'deduction_type']);
        });
    }
}
