<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Cfdi extends Model
{
    use HasFactory;

    protected $table = 'cfdis';

    protected $appends = ['nomina_fecha_final_pago', 'nomina_total_percepciones', 'nomina_total_deducciones'];

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
        'traslados_locales',
        'retenciones_locales',
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
        'global_periodicidad',
        'global_meses',
        'global_year',
        'is_deductible',
        'deduction_type',
        'fecha_fiscal',
    ];

    protected $casts = [
        'fecha' => 'datetime',
        'fecha_fiscal' => 'datetime',
        'total' => 'decimal:2',
        'iva' => 'decimal:2',
        'retenciones' => 'decimal:2',
        'traslados_locales' => 'decimal:2',
        'retenciones_locales' => 'decimal:2',
        'xml_data' => 'array',
    ];
    // --- Nómina accessors (extraídos de xml_data, sin columnas extra en BD) ---
    public function getNominaFechaFinalPagoAttribute(): ?string
    {
        if ($this->tipo !== 'N' || !$this->xml_data) return null;
        return $this->xml_data['cfdi:Comprobante']['cfdi:Complemento']['nomina12:Nomina']['@attributes']['FechaFinalPago'] ?? null;
    }

    public function getNominaTotalPercepcionesAttribute(): ?string
    {
        if ($this->tipo !== 'N' || !$this->xml_data) return null;
        return $this->xml_data['cfdi:Comprobante']['cfdi:Complemento']['nomina12:Nomina']['@attributes']['TotalPercepciones'] ?? null;
    }

    public function getNominaTotalDeduccionesAttribute(): ?string
    {
        if ($this->tipo !== 'N' || !$this->xml_data) return null;
        return $this->xml_data['cfdi:Comprobante']['cfdi:Complemento']['nomina12:Nomina']['@attributes']['TotalDeducciones'] ?? null;
    }

    // Payments that reference THIS invoice as the one being paid (uuid_relacionado = this.uuid)
    public function pagosRelacionados()
    {
        return $this->hasMany(CfdiPayment::class , 'uuid_relacionado', 'uuid');
    }

    // Payments emitted BY this REP CFDI (uuid_pago = this.uuid) — use for tipo=P matching
    public function pagosPropios()
    {
        return $this->hasMany(CfdiPayment::class , 'uuid_pago', 'uuid');
    }
}
