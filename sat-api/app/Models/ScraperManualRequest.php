<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ScraperManualRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'rfc',
        'type',
        'start_date',
        'end_date',
        'status',
        'xml_count',
        'error',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class, 'rfc', 'rfc');
    }
}
