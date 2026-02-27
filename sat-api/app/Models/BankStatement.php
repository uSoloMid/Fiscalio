<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankStatement extends Model
{
    use HasFactory;

    protected $fillable = [
        'business_id',
        'bank_name',
        'account_number',
        'period',
        'total_cargos',
        'total_abonos',
        'initial_balance',
        'final_balance',
        'file_name'
    ];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }

    public function movements()
    {
        return $this->hasMany(BankMovement::class);
    }
}
