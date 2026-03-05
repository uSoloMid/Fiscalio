<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReconciliationPattern extends Model
{
    protected $fillable = [
        'business_id',
        'description_keyword',
        'counterpart_rfc',
        'confirmed_count',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }
}
