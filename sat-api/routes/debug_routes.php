<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ProvisionalControlController;

Route::get('/debug-file', function () {
    $ref = new ReflectionClass(ProvisionalControlController::class);
    return [
    'file' => $ref->getFileName(),
    'methods' => array_map(fn($m) => $m->name, $ref->getMethods()),
    'version' => 'CHECK_v1'
    ];
});
