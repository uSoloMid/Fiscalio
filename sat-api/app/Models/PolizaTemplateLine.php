<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PolizaTemplateLine extends Model
{
    protected $fillable = [
        'template_id', 'sort_order', 'tipo_movto',
        'account_source', 'account_id',
        'importe_source', 'concepto_line', 'is_optional',
    ];

    protected $casts = [
        'is_optional' => 'boolean',
    ];

    public function template()
    {
        return $this->belongsTo(PolizaTemplate::class, 'template_id');
    }

    public function account()
    {
        return $this->belongsTo(Account::class);
    }
}
