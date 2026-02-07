<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateSatRequestsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('sat_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('rfc')->index();
            $table->dateTime('start_date');
            $table->dateTime('end_date');
            $table->string('type')->default('issued'); // issued, received
            $table->string('request_id')->nullable()->unique();
            $table->string('state')->default('created'); // created, polling, downloading, extracting, completed, failed
            $table->string('sat_status')->nullable();
            $table->integer('package_count')->default(0);
            $table->integer('xml_count')->default(0);
            $table->integer('attempts')->default(0);
            $table->text('last_error')->nullable();
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
        Schema::dropIfExists('sat_requests');
    }
}
