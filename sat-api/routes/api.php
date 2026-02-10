<?php

declare(strict_types = 1)
;

use App\Http\Controllers\Api;
use App\Http\Middleware\SystemHasNotBeenSetUp;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\GroupController;
use App\Http\Controllers\TagController;

// unprotected routes
Route::post('/tokens/login', [Api\TokensController::class , 'create'])->name('tokens.login');
Route::post('/initial-set-up', Api\InitialSetUp::class)
    ->middleware(SystemHasNotBeenSetUp::class)
    ->name('initial-set-up');

// protected by token routes
Route::middleware(['auth:sanctum'])->group(function (Router $route): void {
    $route->post('/tokens/logout', [Api\TokensController::class , 'delete'])->name('tokens.logout');
    $route->get('/tokens/current', [Api\TokensController::class , 'current'])->name('tokens.current');

    // User route
    $route->get('/user', function (Request $request) {
            return $request->user();
        }
        );
    });

// CFDI routes (Public for local usage)
Route::get('/cfdis/periods', [InvoiceController::class , 'getPeriods']);
Route::get('/cfdis', [InvoiceController::class , 'indexCfdis']);
Route::get('/cfdis/{uuid}', [InvoiceController::class , 'showCfdi']);
Route::post('/cfdis/{uuid}/refresh-status', [InvoiceController::class , 'refreshCfdiStatus']);
Route::get('/cfdis/{uuid}/xml', [InvoiceController::class , 'downloadXml']);

// SAT Request route
Route::get('/sat/requests/{id}', [InvoiceController::class , 'showRequest']);
Route::post('/sat/sync', [InvoiceController::class , 'startSync']);
Route::post('/sat/verify-status', [InvoiceController::class , 'verifyStatus']);
Route::get('/sat/active-requests', [InvoiceController::class , 'getActiveRequests']);
Route::get('/sat/recent-requests', [InvoiceController::class , 'getRecentRequests']);
Route::get('/sat/requests', [InvoiceController::class , 'indexSatRequests']);
Route::get('/sat/bulk-pdf', [InvoiceController::class , 'downloadBulkPdf']);
Route::get('/cfdis/{uuid}/pdf', [InvoiceController::class , 'downloadPdf']);
Route::get('/cfdis/{uuid}/zip', [InvoiceController::class , 'downloadSingleZip']);

// SAT Routes (Open for now, or protect as needed)
Route::post('/sat/query', [Api\SatController::class , 'query']);
Route::get('/sat/verify/{requestId}', [Api\SatController::class , 'verify']);
Route::get('/sat/download/{packageId}', [Api\SatController::class , 'download']);

// Provisional Control routes
Route::get('/provisional/summary', [\App\Http\Controllers\ProvisionalControlController::class , 'getSummary']);
Route::get('/provisional/ppd-explorer', [\App\Http\Controllers\ProvisionalControlController::class , 'getPpdExplorer']);
Route::get('/provisional/rep-explorer', [\App\Http\Controllers\ProvisionalControlController::class , 'getRepExplorer']);
Route::get('/provisional/bucket-details', [\App\Http\Controllers\ProvisionalControlController::class , 'getBucketDetails']);

// Client routes
Route::get('/clients', [ClientController::class , 'index']);
Route::post('/clients/parse-certificate', [ClientController::class , 'parseCertificate']);
Route::post('/clients', [ClientController::class , 'store']);
Route::put('/clients/{id}/group', [ClientController::class , 'updateGroup']);
Route::put('/clients/{id}/tags', [ClientController::class , 'updateTags']);

// Group routes
Route::get('/groups', [GroupController::class , 'index']);
Route::post('/groups', [GroupController::class , 'store']);

// Tag routes
Route::get('/tags', [TagController::class , 'index']);
Route::post('/tags', [TagController::class , 'store']);

// Account routes
Route::apiResource('accounts', \App\Http\Controllers\AccountController::class);
