<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RfcAccountMap extends Model
{
    protected $fillable = ['business_id', 'rfc', 'nombre', 'account_id'];

    public function business()
    {
        return $this->belongsTo(Business::class);
    }

    public function account()
    {
        return $this->belongsTo(Account::class);
    }
}
