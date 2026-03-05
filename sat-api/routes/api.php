<?php
use App\Http\Controllers\Api;
use App\Http\Middleware\SystemHasNotBeenSetUp;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\GroupController;
use App\Http\Controllers\TagController;
use App\Http\Controllers\AgentController;
use App\Http\Controllers\AuthController;

Route::get('/ping', function () {
    return 'pong';
});
Route::get('/debug/parser', [\App\Http\Controllers\DebugController::class , 'checkParser']);
Route::get('/debug/update-dev', [\App\Http\Controllers\DebugController::class , 'updateDev']);
Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'ok' => true]);
})->name('health');

Route::post('/login', [AuthController::class , 'login']);

// Agent routes (used by internal runner daemon/agent)
Route::prefix('agent')->group(function () {
    Route::get('sync-clients', [AgentController::class , 'syncClients']);
    Route::post('confirm-credentials', [AgentController::class , 'confirmCredentials']);
    Route::get('runner-tick', [AgentController::class , 'runnerTick']);
    Route::post('upload-document', [\App\Http\Controllers\SatDocumentController::class, 'uploadFromAgent']);
});

Route::middleware(['auth:sanctum'])->group(function () {
    Route::post('/logout', [AuthController::class , 'logout']);
    Route::get('/user', [AuthController::class , 'user']);

    // UI Routes
    Route::post('/cfdis/upload', [\App\Http\Controllers\UploadController::class , 'uploadManual']);
    Route::get('/cfdis/periods', [InvoiceController::class , 'getPeriods']);
    Route::get('/cfdis/export', [InvoiceController::class , 'exportExcel']);
    Route::get('/cfdis', [InvoiceController::class , 'indexCfdis']);
    Route::get('/cfdis/{uuid}', [InvoiceController::class , 'showCfdi']);
    Route::post('/cfdis/{uuid}/refresh-status', [InvoiceController::class , 'refreshCfdiStatus']);
    Route::get('/cfdis/{uuid}/xml', [InvoiceController::class , 'downloadXml']);

    Route::get('/sat/requests/{id}', [InvoiceController::class , 'showRequest']);
    Route::post('/sat/sync', [InvoiceController::class , 'startSync']);
    Route::post('/sat/manual-request', [InvoiceController::class , 'manualRequest']);
    Route::post('/sat/verify-status', [InvoiceController::class , 'verifyStatus']);
    Route::get('/sat/active-requests', [InvoiceController::class , 'getActiveRequests']);
    Route::get('/sat/recent-requests', [InvoiceController::class , 'getRecentRequests']);
    Route::get('/sat/requests', [InvoiceController::class , 'indexSatRequests']);
    Route::post('/sat/requests/{id}/verify', [InvoiceController::class , 'verifySatRequest']);
    Route::delete('/sat/requests-bulk', [InvoiceController::class , 'bulkDeleteSatRequests']);
    Route::delete('/sat/requests/{id}', [InvoiceController::class , 'deleteSatRequest']);
    Route::get('/sat/runner-status', [InvoiceController::class , 'getRunnerStatus']);
    Route::post('/sat/fill-gaps', [InvoiceController::class , 'fillGaps']);
    Route::get('/sat/coverage', [InvoiceController::class , 'getSatCoverage']);
    Route::get('/sat/bulk-pdf', [InvoiceController::class , 'downloadBulkPdf']);
    Route::get('/cfdis/{uuid}/pdf', [InvoiceController::class , 'downloadPdf']);
    Route::get('/cfdis/{uuid}/zip', [InvoiceController::class , 'downloadSingleZip']);

    Route::post('/sat/query', [Api\SatController::class , 'query']);
    Route::get('/sat/verify/{requestId}', [Api\SatController::class , 'verify']);
    Route::get('/sat/download/{packageId}', [Api\SatController::class , 'download']);

    // Trigger agent scraper directly
    Route::post(
        '/sat/scrape-fiel',
        function (Request $request) {
            $rfc = $request->json('rfc');
            if (!$rfc)
                return response()->json(['error' => 'RFC required'], 400);

            try {
                $agentUrl = env('AGENT_URL', 'http://fiscalio-agent:3005');
                $response = \Illuminate\Support\Facades\Http::timeout(5)->post("$agentUrl/run-scraper", [
                    'rfc' => $rfc
                ]);
                return response()->json($response->json(), $response->status());
            }
            catch (\Exception $e) {
                return response()->json(['error' => 'Failed to reach agent -> ' . $e->getMessage()], 500);
            }
        }
        );

        Route::get('/provisional/summary', [\App\Http\Controllers\ProvisionalControlController::class , 'getSummary']);
        Route::get('/provisional/export-excel', [\App\Http\Controllers\ProvisionalControlController::class , 'exportExcel']);
        Route::get('/provisional/ppd-explorer', [\App\Http\Controllers\ProvisionalControlController::class , 'getPpdExplorer']);
        Route::get('/provisional/rep-explorer', [\App\Http\Controllers\ProvisionalControlController::class , 'getRepExplorer']);
        Route::get('/provisional/bucket-details', [\App\Http\Controllers\ProvisionalControlController::class , 'getBucketDetails']);
        Route::post('/cfdis/{uuid}/update-deductibility', [\App\Http\Controllers\ProvisionalControlController::class , 'updateDeductibility']);
        Route::get('/provisional/export-pdf', [\App\Http\Controllers\ProvisionalControlController::class , 'exportDetailedBucketPdf']);
        Route::get('/provisional/export-pdf-summary', [\App\Http\Controllers\ProvisionalControlController::class , 'exportPdfSummary']);
        Route::post('/provisional/download-xml', [\App\Http\Controllers\DownloadController::class , 'downloadXmlZip']);

        Route::get('/clients', [ClientController::class , 'index']);
        Route::post('/clients/parse-certificate', [ClientController::class , 'parseCertificate']);
        Route::post('/clients', [ClientController::class , 'store']);
        Route::put('/clients/{id}', [ClientController::class , 'updateClient']);
        Route::delete('/clients/{id}', [ClientController::class , 'destroy']);
        Route::put('/clients/{id}/group', [ClientController::class , 'updateGroup']);
        Route::put('/clients/{id}/tags', [ClientController::class , 'updateTags']);
        Route::post('/clients/{id}/fiel', [ClientController::class , 'updateFiel']);
        Route::get('/clients/{rfc}/notes', [ClientController::class , 'notes']);
        Route::post('/clients/notes/{noteId}/resolve', [ClientController::class , 'resolveNote']);

        Route::get('/groups', [GroupController::class , 'index']);
        Route::post('/groups', [GroupController::class , 'store']);
        Route::put('/groups/{id}', [GroupController::class , 'update']);
        Route::delete('/groups/{id}', [GroupController::class , 'destroy']);

        Route::get('/tags', [TagController::class , 'index']);
        Route::post('/tags', [TagController::class , 'store']);
        Route::put('/tags/{id}', [TagController::class , 'update']);
        Route::delete('/tags/{id}', [TagController::class , 'destroy']);

        Route::apiResource('accounts', \App\Http\Controllers\AccountController::class);

        // Bank Statements
        Route::post('/bank-statements/process', [\App\Http\Controllers\BankStatementController::class , 'process']);
        Route::post('/bank-statements/confirm', [\App\Http\Controllers\BankStatementController::class , 'confirm']);
        Route::get('/bank-statements', [\App\Http\Controllers\BankStatementController::class , 'index']);
        Route::get('/bank-statements/{id}', [\App\Http\Controllers\BankStatementController::class , 'show']);
        Route::delete('/bank-statements/{id}', [\App\Http\Controllers\BankStatementController::class , 'destroy']);
        Route::put('/bank-movements/{id}', [\App\Http\Controllers\BankStatementController::class , 'updateMovement']);

        // Reconciliation
        Route::get('/reconciliation/suggest/{statementId}', [\App\Http\Controllers\ReconciliationController::class, 'suggest']);
        Route::post('/bank-movements/{id}/reconcile', [\App\Http\Controllers\ReconciliationController::class, 'reconcile']);
        Route::delete('/bank-movements/{id}/reconcile', [\App\Http\Controllers\ReconciliationController::class, 'unreconcile']);

        // SAT Documents (CSF + Opinión 32-D)
        Route::get('/sat-documents', [\App\Http\Controllers\SatDocumentController::class, 'index']);
        Route::get('/sat-documents/{id}/download', [\App\Http\Controllers\SatDocumentController::class, 'download']);
    });

require __DIR__ . '/debug_routes.php';
require __DIR__ . '/debug_cwd.php';
