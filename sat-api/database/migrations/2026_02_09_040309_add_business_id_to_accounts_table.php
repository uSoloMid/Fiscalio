<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddBusinessIdToAccountsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // 1. Add business_id with a default of 1 if it doesn't exist
        if (!Schema::hasColumn('accounts', 'business_id')) {
            Schema::table('accounts', function (Blueprint $table) {
                $table->unsignedBigInteger('business_id')->default(1)->after('id');
            });
        }

        Schema::table('accounts', function (Blueprint $table) {
            // 2. Drop the old unique index on internal_code
            try {
                // In SQLite sometimes the index name doesn't follow the pattern
                // We try to drop it by column name if dropUnique supports it
                $table->dropUnique('accounts_internal_code_unique');
            }
            catch (\Exception $e) {
                // If it fails, maybe it's just 'internal_code_unique'
                try {
                    $table->dropUnique(['internal_code']);
                }
                catch (\Exception $e2) {
                }
            }

            // 3. Add the new composite unique index
            try {
                $table->unique(['business_id', 'internal_code']);
            }
            catch (\Exception $e) {
            }

            // 4. Add foreign key
            try {
                $table->foreign('business_id')->references('id')->on('businesses')->onDelete('cascade');
            }
            catch (\Exception $e) {
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
            try {
                $table->dropUnique(['business_id', 'internal_code']);
            }
            catch (\Exception $e) {
            }

            try {
                $table->unique('internal_code');
            }
            catch (\Exception $e) {
            }

            try {
                $table->dropForeign(['business_id']);
            }
            catch (\Exception $e) {
            }

            try {
                $table->dropColumn('business_id');
            }
            catch (\Exception $e) {
            }
        });
    }
}
