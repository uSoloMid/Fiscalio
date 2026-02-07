<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddRetryColumnsToSatRequestsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('sat_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('sat_requests', 'next_retry_at')) {
                $table->dateTime('next_retry_at')->nullable();
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
        Schema::table('sat_requests', function (Blueprint $table) {
            if (Schema::hasColumn('sat_requests', 'next_retry_at')) {
                $table->dropColumn('next_retry_at');
            }
        });
    }
}
