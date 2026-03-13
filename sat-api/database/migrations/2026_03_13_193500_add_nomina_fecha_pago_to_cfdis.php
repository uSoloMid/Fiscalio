<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->date('nomina_fecha_pago')->nullable()->after('fecha');
        });

        // Populate from xml_data for existing nómina CFDIs
        DB::statement("
            UPDATE cfdis
            SET nomina_fecha_pago = JSON_UNQUOTE(JSON_EXTRACT(xml_data, '$.\"cfdi:Comprobante\".\"cfdi:Complemento\".\"nomina12:Nomina\".\"@attributes\".FechaPago'))
            WHERE tipo = 'N'
              AND xml_data IS NOT NULL
              AND JSON_EXTRACT(xml_data, '$.\"cfdi:Comprobante\".\"cfdi:Complemento\".\"nomina12:Nomina\".\"@attributes\".FechaPago') IS NOT NULL
        ");
    }

    public function down(): void
    {
        Schema::table('cfdis', function (Blueprint $table) {
            $table->dropColumn('nomina_fecha_pago');
        });
    }
};
