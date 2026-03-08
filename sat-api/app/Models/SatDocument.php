<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SatDocument extends Model
{
    protected $fillable = [
        'rfc',
        'type',
        'file_path',
        'file_size',
        'opinion_result',
        'requested_at',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class, 'rfc', 'rfc');
    }
}
