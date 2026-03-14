<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankMovementCfdi extends Model
{
    public $timestamps = false;

    protected $table = 'bank_movement_cfdis';

    protected $fillable = [
        'bank_movement_id',
        'cfdi_id',
        'confidence',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function movement()
    {
        return $this->belongsTo(BankMovement::class, 'bank_movement_id');
    }

    public function cfdi()
    {
        return $this->belongsTo(Cfdi::class);
    }
}
