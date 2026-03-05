<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPerformanceIndexesToCfdisTable extends Migration
{
    public function up()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->index('tipo');
            $table->index('es_cancelado');
            // Composite indexes for the most common query pattern: RFC + date range
            $table->index(['rfc_emisor', 'fecha_fiscal']);
            $table->index(['rfc_receptor', 'fecha_fiscal']);
        });
    }

    public function down()
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->dropIndex(['tipo']);
            $table->dropIndex(['es_cancelado']);
            $table->dropIndex(['rfc_emisor', 'fecha_fiscal']);
            $table->dropIndex(['rfc_receptor', 'fecha_fiscal']);
        });
    }
}
