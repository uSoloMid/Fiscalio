<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CfdiPayment extends Model
{
    use HasFactory;

    protected $table = 'cfdi_payments';

    protected $fillable = [
        'uuid_pago',
        'uuid_relacionado',
        'fecha_pago',
        'monto_pagado',
        'num_parcialidad',
        'saldo_anterior',
        'saldo_insoluto',
        'moneda_pago',
        'tipo_cambio_pago',
    ];

    protected $casts = [
        'fecha_pago' => 'datetime',
        'monto_pagado' => 'decimal:2',
        'saldo_anterior' => 'decimal:2',
        'saldo_insoluto' => 'decimal:2',
    ];

    public function pago()
    {
        return $this->belongsTo(Cfdi::class , 'uuid_pago', 'uuid');
    }

    public function relacionado()
    {
        return $this->belongsTo(Cfdi::class , 'uuid_relacionado', 'uuid');
    }
}
