<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cfdi extends Model
{
    use HasFactory;

    protected $table = 'cfdis';

    protected $fillable = [
        'uuid',
        'rfc_emisor',
        'rfc_receptor',
        'name_emisor',
        'name_receptor',
        'fecha',
        'tipo',
        'total',
        'subtotal', // Assuming we might want this later, but for now user asked for Concept, IVA, Retenciones. Wait, user didn't ask for subtotal. Keep strictly what requested + standard.
        // User asked: Concepto, Total, iva, impuestos ret, uuid.
        'concepto',
        'iva',
        'retenciones',
        'path_xml',
        'request_id',
    ];

    protected $casts = [
        'fecha' => 'datetime',
        'total' => 'decimal:2',
        'iva' => 'decimal:2',
        'retenciones' => 'decimal:2',
    ];
}
