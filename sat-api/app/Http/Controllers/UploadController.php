<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\XmlProcessorService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use ZipArchive;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public function uploadManual(Request $request, XmlProcessorService $xmlProcessor)
    {
        $request->validate([
            'files' => 'required|array',
            'files.*' => 'required|file|mimes:xml,zip',
            'rfc_user' => 'required|string',
        ]);

        $rfcUser = strtoupper($request->input('rfc_user'));
        $uploadedFiles = $request->file('files');

        $results = [
            'success' => 0,
            'failed' => 0,
            'details' => []
        ];

        foreach ($uploadedFiles as $file) {
            $extension = strtolower($file->getClientOriginalExtension());
            $originalName = $file->getClientOriginalName();

            try {
                if ($extension === 'xml') {
                    $content = file_get_contents($file->getRealPath());
                    $res = $xmlProcessor->processManualFile($content, $rfcUser);

                    if ($res['success']) {
                        $results['success']++;
                    }
                    else {
                        $results['failed']++;
                    }
                    $results['details'][] = [
                        'file' => $originalName,
                        'status' => $res['success'] ? 'success' : 'error',
                        'message' => $res['message']
                    ];
                }
                elseif ($extension === 'zip') {
                    // Procesar ZIP
                    $zip = new ZipArchive;
                    if ($zip->open($file->getRealPath()) === TRUE) {
                        $tmpDir = 'temp/upload_' . Str::random(10);
                        Storage::makeDirectory($tmpDir);
                        $fullTmpDir = Storage::path($tmpDir);

                        $zip->extractTo($fullTmpDir);
                        $zip->close();

                        $extractedFiles = Storage::allFiles($tmpDir);
                        foreach ($extractedFiles as $extFile) {
                            if (str_ends_with(strtolower($extFile), '.xml')) {
                                $content = (string)Storage::get($extFile);
                                $res = $xmlProcessor->processManualFile($content, $rfcUser);

                                if ($res['success']) {
                                    $results['success']++;
                                }
                                else {
                                    $results['failed']++;
                                }
                                $results['details'][] = [
                                    'file' => $originalName . ' -> ' . basename($extFile),
                                    'status' => $res['success'] ? 'success' : 'error',
                                    'message' => $res['message']
                                ];
                            }
                        }
                        Storage::deleteDirectory($tmpDir);
                    }
                    else {
                        $results['failed']++;
                        $results['details'][] = [
                            'file' => $originalName,
                            'status' => 'error',
                            'message' => 'No se pudo abrir el archivo ZIP'
                        ];
                    }
                }
            }
            catch (\Exception $e) {
                Log::error("Error subiendo archivo $originalName: " . $e->getMessage());
                $results['failed']++;
                $results['details'][] = [
                    'file' => $originalName,
                    'status' => 'error',
                    'message' => 'Error inesperado: ' . $e->getMessage()
                ];
            }
        }

        return response()->json($results);
    }
}
