<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PolizaTemplate extends Model
{
    protected $fillable = [
        'business_id', 'name', 'tipo_poliza',
        'concepto_template', 'trigger_type',
        'cfdi_tipo', 'cfdi_role', 'movement_direction',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }

    public function lines()
    {
        return $this->hasMany(PolizaTemplateLine::class, 'template_id')->orderBy('sort_order');
    }

    public function polizas()
    {
        return $this->hasMany(Poliza::class, 'template_id');
    }

    // Labels legibles
    public function getTipoLabelAttribute(): string
    {
        return match ($this->tipo_poliza) {
            1 => 'Ingreso',
            2 => 'Egreso',
            3 => 'Diario',
            default => 'Desconocido',
        };
    }
}
