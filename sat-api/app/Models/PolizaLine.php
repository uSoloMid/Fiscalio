<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PolizaLine extends Model
{
    protected $fillable = [
        'poliza_id', 'sort_order', 'account_id',
        'tipo_movto', 'importe', 'concepto', 'uuid_cfdi',
    ];

    protected $casts = [
        'importe' => 'float',
    ];

    public function poliza()
    {
        return $this->belongsTo(Poliza::class);
    }

    public function account()
    {
        return $this->belongsTo(Account::class);
    }
}
