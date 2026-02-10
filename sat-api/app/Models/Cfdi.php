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
        'serie',
        'folio',
        'rfc_emisor',
        'regimen_fiscal_emisor',
        'rfc_receptor',
        'regimen_fiscal_receptor',
        'domicilio_fiscal_receptor',
        'name_emisor',
        'name_receptor',
        'fecha',
        'tipo',
        'exportacion',
        'subtotal',
        'descuento',
        'metodo_pago',
        'forma_pago',
        'uso_cfdi',
        'total',
        'moneda',
        'tipo_cambio',
        'concepto',
        'iva',
        'retenciones',
        'path_xml',
        'request_id',
        'estado_sat',
        'es_cancelado',
        'fecha_cancelacion',
        'estado_sat_updated_at',
        'es_cancelable',
        'estatus_cancelacion',
        'validacion_efos',
        'xml_data',
    ];

    protected $casts = [
        'fecha' => 'datetime',
        'total' => 'decimal:2',
        'iva' => 'decimal:2',
        'retenciones' => 'decimal:2',
        'xml_data' => 'array',
    ];
    public function pagosRelacionados()
    {
        return $this->hasMany(CfdiPayment::class , 'uuid_relacionado', 'uuid');
    }
}
