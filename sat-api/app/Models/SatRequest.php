<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SatRequest extends Model
{
    use HasFactory;

    protected $table = 'sat_requests';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'rfc',
        'start_date',
        'end_date',
        'type',
        'request_id',
        'state',
        'sat_status',
        'package_count',
        'xml_count',
        'attempts',
        'last_error',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'package_count' => 'integer',
        'xml_count' => 'integer',
        'attempts' => 'integer',
    ];
}
