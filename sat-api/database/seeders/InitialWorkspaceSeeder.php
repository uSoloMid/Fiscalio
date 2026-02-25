<?php

namespace Database\Seeders;

use App\Models\Business;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class InitialWorkspaceSeeder extends Seeder
{
    public function run()
    {
        // Check if we already have a user
        $user = User::where('email', 'alejandro@fiscalio.com')->first();
        if (!$user) {
            $user = User::create([
                'name' => 'Alejandro',
                'email' => 'alejandro@fiscalio.com',
                'password' => Hash::make('Fiscalio2026'), // Temporal pass, can be changed later
                'is_admin' => true,
            ]);
        }

        // Check if we already have a workspace
        $workspace = Workspace::first();
        if (!$workspace) {
            $workspace = Workspace::create([
                'name' => 'Despacho Alejandro',
                'owner_id' => $user->id,
            ]);
        }

        // Update user
        $user->update(['current_workspace_id' => $workspace->id]);

        // Assing all businesses to this workspace
        Business::whereNull('workspace_id')->update(['workspace_id' => $workspace->id]);
    }
}
