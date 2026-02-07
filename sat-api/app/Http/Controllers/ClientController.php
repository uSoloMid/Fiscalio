<?php

declare(strict_types = 1)
;

namespace App\Http\Controllers;

use App\Models\Business;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        $query = Business::with(['group', 'tags'])->withCount('petitions');

        if ($request->filled('q')) {
            $q = $request->q;
            $query->where(function ($builder) use ($q) {
                $builder->where('rfc', 'like', "%$q%")
                    ->orWhere('legal_name', 'like', "%$q%");
            });
        }

        if ($request->filled('group_id')) {
            if ($request->group_id === 'null') {
                $query->whereNull('group_id');
            }
            else {
                $query->where('group_id', $request->group_id);
            }
        }

        if ($request->filled('tag_ids')) {
            $tagIds = explode(',', $request->tag_ids);
            foreach ($tagIds as $tagId) {
                $query->whereHas('tags', function ($q) use ($tagId) {
                    $q->where('tags.id', $tagId);
                });
            }
        }

        $sort = $request->get('sort', 'name_asc');
        switch ($sort) {
            case 'last_sync_at_desc':
                // For now we don't have last_sync_at in business table directly, 
                // but we could use updated_at or join with petitions if needed.
                $query->orderBy('updated_at', 'desc');
                break;
            case 'name_asc':
            default:
                $query->orderBy('legal_name', 'asc');
                break;
        }

        return response()->json($query->paginate($request->get('pageSize', 20)));
    }

    public function updateGroup(Request $request, $id)
    {
        $request->validate(['group_id' => 'nullable|exists:groups,id']);
        $business = Business::findOrFail($id);
        $business->update(['group_id' => $request->group_id]);
        return response()->json($business->load('group'));
    }

    public function updateTags(Request $request, $id)
    {
        $request->validate(['tag_ids' => 'array', 'tag_ids.*' => 'exists:tags,id']);
        $business = Business::findOrFail($id);
        $business->tags()->sync($request->tag_ids);
        return response()->json($business->load('tags'));
    }

    public function parseCertificate(Request $request)
    {
        $request->validate([
            'certificate' => 'required|file',
        ]);

        $file = $request->file('certificate');
        $content = file_get_contents($file->getRealPath());

        if (strpos($content, '-----BEGIN CERTIFICATE-----') === false) {
            $content = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($content), 64, "\n") . "-----END CERTIFICATE-----\n";
        }

        $data = openssl_x509_parse($content);
        if (!$data) {
            return response()->json(['error' => 'Certificado inválido'], 400);
        }

        $rfc = $data['subject']['x500UniqueIdentifier'] ?? '';
        $name = $data['subject']['CN'] ?? '';
        $validUntil = date('Y-m-d H:i:s', $data['validTo_time_t']);

        return response()->json([
            'rfc' => $rfc,
            'name' => $name,
            'valid_until' => $validUntil,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'rfc' => 'required|string',
            'legal_name' => 'required|string',
            'common_name' => 'nullable|string',
            'certificate' => 'required|file',
            'private_key' => 'required|file',
            'passphrase' => 'required|string',
            'ciec' => 'nullable|string',
            'group_id' => 'nullable|exists:groups,id'
        ]);

        $certContent = file_get_contents($request->file('certificate')->getRealPath());
        $keyContent = file_get_contents($request->file('private_key')->getRealPath());

        $data = openssl_x509_parse($certContent);
        if (!$data && strpos($certContent, '-----BEGIN CERTIFICATE-----') === false) {
            $pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($certContent), 64, "\n") . "-----END CERTIFICATE-----\n";
            $data = openssl_x509_parse($pem);
        }

        $validUntil = $data ? date('Y-m-d H:i:s', $data['validTo_time_t']) : now()->addYears(4);

        $business = Business::updateOrCreate(
        ['rfc' => strtoupper($request->rfc)],
        [
            'legal_name' => $request->legal_name,
            'common_name' => $request->common_name ?? $request->legal_name,
            'certificate' => base64_encode($certContent),
            'private_key' => base64_encode($keyContent),
            'passphrase' => $request->passphrase,
            'ciec' => $request->ciec,
            'group_id' => $request->group_id,
            'valid_until' => $validUntil,
        ]
        );

        return response()->json($business);
    }
}
