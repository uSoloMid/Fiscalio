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
        'is_reviewed'
    ];

    protected $casts = [
        'is_reviewed' => 'boolean',
        'cargo' => 'float',
        'abono' => 'float',
        'saldo' => 'float',
    ];

    public function statement()
    {
        return $this->belongsTo(BankStatement::class , 'bank_statement_id');
    }

    public function cfdi()
    {
        return $this->belongsTo(Cfdi::class);
    }
}
