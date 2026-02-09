<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    use HasFactory;

    protected $fillable = [
        'business_id',
        'is_custom',
        'internal_code',
        'sat_code',
        'name',
        'level',
        'type',
        'naturaleza',
        'parent_code',
        'is_selectable',
        'is_postable',
        'generate_auxiliaries',
        'currency',
        'is_cash_flow',
        'is_active',
        'description',
        'balance'
    ];

    protected $casts = [
        'is_selectable' => 'boolean',
        'is_postable' => 'boolean',
        'generate_auxiliaries' => 'boolean',
        'is_cash_flow' => 'boolean',
        'is_active' => 'boolean',
        'is_custom' => 'boolean',
        'balance' => 'decimal:2',
        'level' => 'integer',
    ];
}
