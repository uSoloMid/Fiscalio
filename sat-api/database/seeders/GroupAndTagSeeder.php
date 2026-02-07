<?php

namespace Database\Seeders;

use App\Models\Group;
use App\Models\Tag;
use Illuminate\Database\Seeder;

class GroupAndTagSeeder extends Seeder
{
    public function run()
    {
        $groups = [
            ['name' => 'Despacho Norte', 'color' => '#135bec'],
            ['name' => 'Corporativos', 'color' => '#8b5cf6'],
            ['name' => 'Personas Físicas', 'color' => '#f59e0b'],
        ];

        foreach ($groups as $group) {
            Group::firstOrCreate(['name' => $group['name']], $group);
        }

        $tags = [
            ['name' => 'RESICO', 'color' => '#10b981'],
            ['name' => 'PM', 'color' => '#6366f1'],
            ['name' => 'Grande', 'color' => '#ef4444'],
            ['name' => 'Prioridad Alta', 'color' => '#ef4444'],
            ['name' => 'Sector: Restaurante', 'color' => '#f97316'],
            ['name' => 'Sector: Construcción', 'color' => '#8b5cf6'],
        ];

        foreach ($tags as $tag) {
            Tag::firstOrCreate(['name' => $tag['name']], $tag);
        }
    }
}
