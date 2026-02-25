<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Workspace extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'owner_id'];

    public function owner()
    {
        return $this->belongsTo(User::class , 'owner_id');
    }

    public function users()
    {
        return $this->hasMany(User::class , 'current_workspace_id');
    }

    public function businesses()
    {
        return $this->hasMany(Business::class);
    }
}
