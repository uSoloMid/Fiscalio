<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Poliza extends Model
{
    protected $fillable = [
        'business_id', 'bank_movement_id', 'cfdi_id', 'template_id',
        'tipo_poliza', 'numero', 'fecha', 'concepto', 'status', 'exported_at',
    ];

    protected $casts = [
        'fecha'       => 'date',
        'exported_at' => 'datetime',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }

    public function bankMovement()
    {
        return $this->belongsTo(BankMovement::class);
    }

    public function cfdi()
    {
        return $this->belongsTo(Cfdi::class);
    }

    public function template()
    {
        return $this->belongsTo(PolizaTemplate::class, 'template_id');
    }

    public function lines()
    {
        return $this->hasMany(PolizaLine::class)->orderBy('sort_order');
    }

    public function getTipoLabelAttribute(): string
    {
        return match ($this->tipo_poliza) {
            1 => 'Ingreso',
            2 => 'Egreso',
            3 => 'Diario',
            default => '?',
        };
    }

    // Verifica que la póliza cuadre (suma cargos = suma abonos)
    public function isBalanced(): bool
    {
        $cargos = $this->lines->where('tipo_movto', 0)->sum('importe');
        $abonos = $this->lines->where('tipo_movto', 1)->sum('importe');
        return abs($cargos - $abonos) < 0.01;
    }
}
