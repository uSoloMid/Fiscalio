<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class WhatsAppService
{
    private string $token;
    private string $phoneNumberId;
    private string $baseUrl;

    public function __construct()
    {
        $this->token         = config('services.whatsapp.token', '');
        $this->phoneNumberId = config('services.whatsapp.phone_number_id', '');
        $this->baseUrl       = 'https://graph.facebook.com/v22.0';
    }

    /**
     * Send a plain text message.
     */
    public function sendText(string $to, string $text): bool
    {
        $response = Http::withToken($this->token)
            ->post("{$this->baseUrl}/{$this->phoneNumberId}/messages", [
                'messaging_product' => 'whatsapp',
                'to'                => $to,
                'type'              => 'text',
                'text'              => ['body' => $text],
            ]);

        if (!$response->successful()) {
            Log::error('WhatsApp sendText failed', ['to' => $to, 'body' => $response->body()]);
            return false;
        }

        return true;
    }

    /**
     * Upload a PDF to WhatsApp media and return the media_id.
     */
    public function uploadMedia(string $filePath): ?string
    {
        if (!Storage::exists($filePath)) {
            Log::error('WhatsApp uploadMedia: file not found', ['path' => $filePath]);
            return null;
        }

        $fullPath = Storage::path($filePath);

        $response = Http::withToken($this->token)
            ->attach('file', file_get_contents($fullPath), basename($filePath), ['Content-Type' => 'application/pdf'])
            ->post("{$this->baseUrl}/{$this->phoneNumberId}/media", [
                'messaging_product' => 'whatsapp',
                'type'              => 'application/pdf',
            ]);

        if (!$response->successful()) {
            Log::error('WhatsApp uploadMedia failed', ['body' => $response->body()]);
            return null;
        }

        return $response->json('id');
    }

    /**
     * Send a document (PDF) message.
     */
    public function sendDocument(string $to, string $mediaId, string $filename, string $caption = ''): bool
    {
        $payload = [
            'messaging_product' => 'whatsapp',
            'to'                => $to,
            'type'              => 'document',
            'document'          => [
                'id'       => $mediaId,
                'filename' => $filename,
                'caption'  => $caption,
            ],
        ];

        $response = Http::withToken($this->token)
            ->post("{$this->baseUrl}/{$this->phoneNumberId}/messages", $payload);

        if (!$response->successful()) {
            Log::error('WhatsApp sendDocument failed', ['to' => $to, 'body' => $response->body()]);
            return false;
        }

        return true;
    }

    /**
     * Upload and send a PDF from a storage path.
     */
    public function sendPdf(string $to, string $filePath, string $filename, string $caption = ''): bool
    {
        $mediaId = $this->uploadMedia($filePath);
        if (!$mediaId) {
            return false;
        }

        return $this->sendDocument($to, $mediaId, $filename, $caption);
    }

    /**
     * Upload and send a PDF from raw bytes (in-memory).
     */
    public function sendPdfBytes(string $to, string $bytes, string $filename, string $caption = ''): bool
    {
        $response = Http::withToken($this->token)
            ->attach('file', $bytes, $filename, ['Content-Type' => 'application/pdf'])
            ->post("{$this->baseUrl}/{$this->phoneNumberId}/media", [
                'messaging_product' => 'whatsapp',
                'type'              => 'application/pdf',
            ]);

        if (!$response->successful()) {
            Log::error('WhatsApp uploadMedia (bytes) failed', ['body' => $response->body()]);
            return false;
        }

        $mediaId = $response->json('id');
        return $this->sendDocument($to, $mediaId, $filename, $caption);
    }
}
