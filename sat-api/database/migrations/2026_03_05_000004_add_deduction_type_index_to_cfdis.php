<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDeductionTypeIndexToCfdis extends Migration
{
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->index(['rfc_receptor', 'deduction_type', 'fecha_fiscal'], 'cfdis_rfc_receptor_deduction_fecha_index');
            $table->index(['rfc_emisor', 'deduction_type', 'fecha_fiscal'], 'cfdis_rfc_emisor_deduction_fecha_index');
        });
    }

    public function down()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->dropIndex('cfdis_rfc_receptor_deduction_fecha_index');
            $table->dropIndex('cfdis_rfc_emisor_deduction_fecha_index');
        });
    }
}
