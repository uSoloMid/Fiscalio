<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BusinessNote extends Model
{
    protected $fillable = [
        'rfc',
        'type',
        'title',
        'body',
        'invoice_type',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class, 'rfc', 'rfc');
    }
}
