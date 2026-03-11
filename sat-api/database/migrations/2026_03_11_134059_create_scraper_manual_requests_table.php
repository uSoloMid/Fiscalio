<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateScraperManualRequestsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('scraper_manual_requests', function (Blueprint $table) {
            $table->id();
            $table->string('rfc')->index();
            $table->string('type'); // issued, received
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status')->default('pending'); // pending, processing, completed, failed
            $table->integer('xml_count')->default(0);
            $table->text('error')->nullable();
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
        Schema::dropIfExists('scraper_manual_requests');
    }
}
