<?php

declare(strict_types = 1)
;

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    /** @var array<string> */
    protected $fillable = ['name', 'email', 'password', 'is_admin', 'current_workspace_id'];

    /** @var array<string> */
    protected $hidden = ['password', 'remember_token'];

    /** @var array<string, string> */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_admin' => 'boolean',
    ];

    public function businesses(): BelongsToMany
    {
        return $this->belongsToMany(Business::class);
    }

    public function currentWorkspace()
    {
        return $this->belongsTo(Workspace::class , 'current_workspace_id');
    }

    public function ownedWorkspaces()
    {
        return $this->hasMany(Workspace::class , 'owner_id');
    }

    /**
     * Query base de businesses accesibles para este usuario.
     * Admin: todos los del workspace. Contador: solo los asignados via business_user.
     */
    public function accessibleBusinessQuery()
    {
        $query = Business::where('workspace_id', $this->current_workspace_id);

        if (!$this->is_admin) {
            $assignedIds = $this->businesses()->pluck('businesses.id');
            $query->whereIn('id', $assignedIds);
        }

        return $query;
    }
}
