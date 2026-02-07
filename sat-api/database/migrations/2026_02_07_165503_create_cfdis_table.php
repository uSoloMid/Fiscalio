<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCfdisTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('cfdis', function (Blueprint $table) {
            $table->id();
            $table->string('uuid', 36)->unique();
            $table->string('rfc_emisor', 13)->index();
            $table->string('rfc_receptor', 13)->index();
            $table->string('name_emisor')->nullable();
            $table->string('name_receptor')->nullable();
            $table->dateTime('fecha')->index();
            $table->string('tipo', 10)->nullable(); // I, E, T, N, P
            $table->decimal('total', 18, 2)->default(0);
            $table->text('path_xml')->nullable();
            $table->string('request_id')->nullable()->index(); // Referencia al request que lo descargó
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('cfdis');
    }
}
