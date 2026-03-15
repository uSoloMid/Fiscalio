<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankAccountMap extends Model
{
    protected $fillable = [
        'business_id', 'bank_statement_id',
        'bank_name', 'account_number', 'account_id',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }

    public function account()
    {
        return $this->belongsTo(Account::class);
    }

    public function bankStatement()
    {
        return $this->belongsTo(BankStatement::class);
    }
}
