<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'bank_statement_id',
        'date',
        'description',
        'reference',
        'cargo',
        'abono',
        'saldo',
        'cfdi_id',
        'account_id',
        'is_reviewed',
        'confidence',
        'reconciled_at',
    ];

    protected $casts = [
        'is_reviewed' => 'boolean',
        'cargo' => 'float',
        'abono' => 'float',
        'saldo' => 'float',
        'reconciled_at' => 'datetime',
    ];

    public function statement()
    {
        return $this->belongsTo(BankStatement::class , 'bank_statement_id');
    }

    public function cfdi()
    {
        return $this->belongsTo(Cfdi::class);
    }

    public function cfdis()
    {
        return $this->belongsToMany(Cfdi::class, 'bank_movement_cfdis')
            ->withPivot('confidence', 'created_at')
            ->orderBy('bank_movement_cfdis.created_at');
    }

    public function movementCfdis()
    {
        return $this->hasMany(BankMovementCfdi::class);
    }
}
