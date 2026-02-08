<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    use HasFactory;

    protected $fillable = [
        'internal_code',
        'sat_code',
        'name',
        'level',
        'type',
        'naturaleza',
        'parent_code',
        'is_selectable'
    ];

    protected $casts = [
        'is_selectable' => 'boolean',
        'level' => 'integer',
    ];
}
