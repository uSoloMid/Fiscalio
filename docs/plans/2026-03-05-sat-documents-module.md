# SAT Documents Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated page per client that stores, displays, and allows downloading Constancia de Situación Fiscal (CSF) and Opinión de Cumplimiento 32-D PDFs scraped from SAT, with session logout after each document.

**Architecture:** Agent scrapes PDFs → uploads to `POST /api/agent/upload-document` → backend saves files to `storage/app/sat_docs/{rfc}/` and records metadata in `sat_documents` table → frontend `SatDocumentsPage` reads the list and serves downloads filtered by active RFC.

**Tech Stack:** Laravel 10 / MySQL, React 19 + TypeScript, Node.js + Puppeteer (agent), Axios (agent upload), Tailwind CSS

---

### Task 1: DB Migration

**Files:**
- Create: `sat-api/database/migrations/2026_03_05_000003_create_sat_documents_table.php`

**Step 1: Create migration file**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sat_documents', function (Blueprint $table) {
            $table->id();
            $table->string('rfc', 13)->index();
            $table->enum('type', ['csf', 'opinion_32d']);
            $table->string('file_path', 500);
            $table->unsignedInteger('file_size')->nullable();
            $table->timestamp('requested_at');
            $table->timestamps();

            $table->foreign('rfc')->references('rfc')->on('businesses')->onDelete('cascade');
            $table->index(['rfc', 'type', 'requested_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sat_documents');
    }
};
```

**Step 2: Run migration (production)**

```bash
# Via the /migrate skill or:
ssh fiscalio-server "docker exec sat-api-app php artisan migrate --force"
```

Expected: `sat_documents table created successfully`

**Step 3: Commit**

```bash
git add sat-api/database/migrations/2026_03_05_000003_create_sat_documents_table.php
git commit -m "feat(sat-docs): add sat_documents migration"
```

---

### Task 2: Model

**Files:**
- Create: `sat-api/app/Models/SatDocument.php`

**Step 1: Create model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SatDocument extends Model
{
    protected $fillable = [
        'rfc',
        'type',
        'file_path',
        'file_size',
        'requested_at',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
    ];

    public function business()
    {
        return $this->belongsTo(Business::class, 'rfc', 'rfc');
    }
}
```

**Step 2: Commit**

```bash
git add sat-api/app/Models/SatDocument.php
git commit -m "feat(sat-docs): add SatDocument model"
```

---

### Task 3: Backend Controller

**Files:**
- Create: `sat-api/app/Http/Controllers/SatDocumentController.php`

**Step 1: Create controller**

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SatDocument;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;

class SatDocumentController extends Controller
{
    /**
     * List documents for a given RFC (authenticated).
     */
    public function index(Request $request)
    {
        $rfc = $request->query('rfc');
        if (!$rfc) {
            return response()->json(['error' => 'RFC required'], 400);
        }

        $docs = SatDocument::where('rfc', strtoupper($rfc))
            ->orderBy('requested_at', 'desc')
            ->get()
            ->map(fn($d) => [
                'id'           => $d->id,
                'type'         => $d->type,
                'file_size'    => $d->file_size,
                'requested_at' => $d->requested_at?->toISOString(),
            ]);

        return response()->json($docs);
    }

    /**
     * Serve the PDF file for download (authenticated).
     */
    public function download($id)
    {
        $doc = SatDocument::findOrFail($id);

        if (!Storage::exists($doc->file_path)) {
            return response()->json(['error' => 'Archivo no encontrado'], 404);
        }

        $filename = $doc->type === 'csf'
            ? 'Constancia_Situacion_Fiscal_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf'
            : 'Opinion_Cumplimiento_32D_' . $doc->rfc . '_' . Carbon::parse($doc->requested_at)->format('Y-m-d') . '.pdf';

        return Storage::download($doc->file_path, $filename, [
            'Content-Type' => 'application/pdf',
        ]);
    }

    /**
     * Receive a PDF from the agent (no auth — internal only).
     */
    public function uploadFromAgent(Request $request)
    {
        $rfc  = strtoupper($request->input('rfc', ''));
        $type = $request->input('type', ''); // csf | opinion_32d

        if (!$rfc || !in_array($type, ['csf', 'opinion_32d'])) {
            return response()->json(['error' => 'rfc and type required'], 400);
        }

        if (!$request->hasFile('pdf')) {
            return response()->json(['error' => 'pdf file required'], 400);
        }

        $file      = $request->file('pdf');
        $timestamp = now()->format('Y-m-d_H-i');
        $dir       = "sat_docs/{$rfc}";
        $filename  = "{$type}_{$timestamp}.pdf";
        $path      = $file->storeAs($dir, $filename);

        SatDocument::create([
            'rfc'          => $rfc,
            'type'         => $type,
            'file_path'    => $path,
            'file_size'    => $file->getSize(),
            'requested_at' => now(),
        ]);

        return response()->json(['success' => true, 'path' => $path]);
    }
}
```

**Step 2: Commit**

```bash
git add sat-api/app/Http/Controllers/SatDocumentController.php
git commit -m "feat(sat-docs): add SatDocumentController"
```

---

### Task 4: Register Routes

**Files:**
- Modify: `sat-api/routes/api.php`

**Step 1: Add routes**

In `api.php`, inside the authenticated `Route::middleware('auth:sanctum')` group, add:

```php
// SAT Documents
Route::get('/sat-documents', [\App\Http\Controllers\SatDocumentController::class, 'index']);
Route::get('/sat-documents/{id}/download', [\App\Http\Controllers\SatDocumentController::class, 'download']);
```

In the unauthenticated `Route::prefix('agent')` group, add:

```php
Route::post('upload-document', [\App\Http\Controllers\SatDocumentController::class, 'uploadFromAgent']);
```

**Step 2: Verify routes registered (on server)**

```bash
ssh fiscalio-server "docker exec sat-api-app php artisan route:list | grep sat-doc"
```

Expected output shows the 3 new routes.

**Step 3: Commit**

```bash
git add sat-api/routes/api.php
git commit -m "feat(sat-docs): register API routes for sat_documents"
```

---

### Task 5: Agent — Logout + Upload After Each Document

**Files:**
- Modify: `agent/scraper_sat.js`

**Step 1: Add `uploadToApi` helper function** — insert after the `isSatError` function (around line 20):

```js
async function uploadToApi(rfc, type, filePath) {
    try {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('rfc', rfc);
        form.append('type', type);
        form.append('pdf', fs.createReadStream(filePath), path.basename(filePath));

        const apiUrl = process.env.API_URL || 'http://localhost:10000';
        await axios.post(`${apiUrl}/api/agent/upload-document`, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        });
        console.log(chalk.green(`[UPLOAD] ${type} subido exitosamente para ${rfc}`));
    } catch (e) {
        console.log(chalk.yellow(`[UPLOAD] Advertencia: no se pudo subir ${type}: ${e.message}`));
        // Non-fatal: PDF stays on disk even if upload fails
    }
}
```

Note: `axios` is already a dependency in package.json. Check with `cat agent/package.json | grep axios`.
If missing, run `npm install axios` in `agent/`.

**Step 2: Add `logoutSat` helper function** — insert after `uploadToApi`:

```js
async function logoutSat(browser, logoutUrl) {
    try {
        const page = await browser.newPage();
        await page.goto(logoutUrl, { waitUntil: 'load', timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000));
        await page.close();
        console.log(chalk.gray(`[LOGOUT] Sesión cerrada en ${logoutUrl}`));
    } catch (e) {
        console.log(chalk.gray(`[LOGOUT] No se pudo cerrar sesión (ignorado): ${e.message}`));
        // Non-fatal
    }
}
```

**Step 3: Wire upload + logout in `downloadCSF`** — at the two `return` points inside `downloadCSF` where a successful PDF write occurs (lines ~163 and ~186), add calls after `fs.writeFile(...)`:

```js
// After line: await fs.writeFile(path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'), pdfBuffer);
await uploadToApi(rfc, 'csf', path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'));
await logoutSat(browser, 'https://wwwmat.sat.gob.mx/aplicacion/salir/general');

// After line: await fs.writeFile(path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'), Buffer.from(base64, 'base64'));
await uploadToApi(rfc, 'csf', path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'));
await logoutSat(browser, 'https://wwwmat.sat.gob.mx/aplicacion/salir/general');
```

**Step 4: Wire upload + logout in `downloadOpinion`** — after the successful `fs.writeFile` call for Opinion (~line 229):

```js
// After: await fs.writeFile(path.join(DOWNLOAD_DIR, rfc, 'Opinion_Cumplimiento_32D.pdf'), pdfBuffer);
await uploadToApi(rfc, 'opinion_32d', path.join(DOWNLOAD_DIR, rfc, 'Opinion_Cumplimiento_32D.pdf'));
await logoutSat(browser, 'https://ptsc32d.clouda.sat.gob.mx/logout');
```

**Step 5: Verify axios is available**

```bash
cd agent && node -e "import('axios').then(() => console.log('ok'))"
```

**Step 6: Commit**

```bash
git add agent/scraper_sat.js
git commit -m "feat(sat-docs): agent uploads PDFs to API + SAT session logout"
```

---

### Task 6: Frontend Service Functions

**Files:**
- Modify: `ui/src/services.ts`

**Step 1: Add two functions** at the end of `services.ts`:

```ts
export async function listSatDocuments(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/sat-documents?rfc=${encodeURIComponent(rfc)}`);
    if (!response.ok) throw new Error('Error cargando documentos SAT');
    return response.json();
}

export async function downloadSatDocument(id: number, filename: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/sat-documents/${id}/download`);
    if (!response.ok) throw new Error('Error descargando documento');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
```

**Step 2: Commit**

```bash
git add ui/src/services.ts
git commit -m "feat(sat-docs): add listSatDocuments and downloadSatDocument services"
```

---

### Task 7: Frontend Page — SatDocumentsPage

**Files:**
- Create: `ui/src/pages/SatDocumentsPage.tsx`

**Step 1: Create the page**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { listSatDocuments, downloadSatDocument, triggerScraperFiel } from '../services';

interface SatDoc {
    id: number;
    type: 'csf' | 'opinion_32d';
    file_size: number | null;
    requested_at: string;
}

interface Props {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-MX', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatSize(bytes: number | null) {
    if (!bytes) return '';
    return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

function DocSection({
    title, icon, type, docs, onDownload,
}: {
    title: string;
    icon: string;
    type: 'csf' | 'opinion_32d';
    docs: SatDoc[];
    onDownload: (doc: SatDoc) => void;
}) {
    const filtered = docs.filter(d => d.type === type);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-2xl text-blue-500">{icon}</span>
                <h2 className="text-base font-bold text-gray-800">{title}</h2>
                <span className="ml-auto text-xs text-gray-400">{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    No hay documentos descargados aún. Usa el botón "Robot FIEL" para solicitarlos.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {filtered.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-lg text-red-500">picture_as_pdf</span>
                                <div>
                                    <p className="text-sm font-medium text-gray-700">{formatDate(doc.requested_at)}</p>
                                    {doc.file_size && <p className="text-xs text-gray-400">{formatSize(doc.file_size)}</p>}
                                </div>
                            </div>
                            <button
                                onClick={() => onDownload(doc)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">download</span>
                                Descargar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function SatDocumentsPage({ activeRfc, clientName, onBack }: Props) {
    const [docs, setDocs] = useState<SatDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [scraping, setScraping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await listSatDocuments(activeRfc);
            setDocs(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [activeRfc]);

    useEffect(() => { load(); }, [load]);

    const handleDownload = async (doc: SatDoc) => {
        const label = doc.type === 'csf' ? 'Constancia_Situacion_Fiscal' : 'Opinion_Cumplimiento_32D';
        const date = new Date(doc.requested_at).toISOString().split('T')[0];
        const filename = `${label}_${activeRfc}_${date}.pdf`;
        try {
            await downloadSatDocument(doc.id, filename);
        } catch (e: any) {
            alert('Error al descargar: ' + e.message);
        }
    };

    const handleScrape = async () => {
        setScraping(true);
        try {
            await triggerScraperFiel(activeRfc);
            alert('Solicitud enviada al agente. Los documentos aparecerán en esta página en unos minutos una vez descargados.');
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setScraping(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shadow-sm flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Documentos SAT</h1>
                    <p className="text-xs text-gray-500">{clientName || activeRfc}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium"
                    >
                        <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Actualizar
                    </button>
                    <button
                        onClick={handleScrape}
                        disabled={scraping}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all shadow-sm ${
                            scraping
                                ? 'bg-orange-50 border border-orange-100 text-orange-600'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                    >
                        <span className={`material-symbols-outlined text-base ${scraping ? 'animate-spin' : ''}`}>
                            {scraping ? 'downloading' : 'security'}
                        </span>
                        {scraping ? 'Solicitando...' : 'Robot FIEL — Solicitar docs'}
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
                        {error}
                    </div>
                )}

                <div className="max-w-3xl mx-auto flex flex-col gap-6">
                    <DocSection
                        title="Constancia de Situación Fiscal"
                        icon="badge"
                        type="csf"
                        docs={docs}
                        onDownload={handleDownload}
                    />
                    <DocSection
                        title="Opinión de Cumplimiento 32-D"
                        icon="verified"
                        type="opinion_32d"
                        docs={docs}
                        onDownload={handleDownload}
                    />
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add ui/src/pages/SatDocumentsPage.tsx
git commit -m "feat(sat-docs): add SatDocumentsPage component"
```

---

### Task 8: Wire Up in InvoicesPage

**Files:**
- Modify: `ui/src/pages/InvoicesPage.tsx`

**Step 1: Add import** — at the top of the imports:

```ts
import { SatDocumentsPage } from './SatDocumentsPage';
```

**Step 2: Add sidebar nav item** — inside the "Herramientas" section (after the `Control Prov.` button, around line 575):

```tsx
<button
    onClick={() => { setCurrentView('sat-docs'); setIsSidebarOpen(false); }}
    className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'sat-docs' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
>
    <span className="material-symbols-outlined text-xl">description</span>
    Docs SAT
</button>
```

**Step 3: Add conditional render** — in the `currentView` render block, before the final `else` clause (after the `reconciliation` block, around line 630):

```tsx
) : currentView === 'sat-docs' ? (
    <div className="flex-1 h-screen overflow-hidden">
        <SatDocumentsPage
            activeRfc={activeRfc}
            clientName={clientName || activeClientName || activeRfc}
            onBack={() => setCurrentView('invoices')}
        />
    </div>
```

**Step 4: TypeScript check**

```bash
cd ui && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 5: Commit**

```bash
git add ui/src/pages/InvoicesPage.tsx
git commit -m "feat(sat-docs): wire SatDocumentsPage into InvoicesPage sidebar"
```

---

### Task 9: Deploy

**Step 1: Update PLANNING.md** — mark task active, then complete.

**Step 2: Push and deploy**

Use the `/deploy` skill or:

```bash
git checkout dev && git push origin dev
# Then merge to main and deploy backend
```

**Step 3: Run migration on server**

```bash
ssh fiscalio-server "docker exec sat-api-app php artisan migrate --force"
```

**Step 4: Verify storage directory is writable**

```bash
ssh fiscalio-server "docker exec sat-api-app php artisan tinker --execute=\"Storage::makeDirectory('sat_docs/TEST'); echo Storage::exists('sat_docs/TEST') ? 'ok' : 'fail';\""
```

Expected: `ok`

**Step 5: Move PLANNING entry to HISTORY.md**

---

## Notes

- PDFs saved to `storage/app/sat_docs/{rfc}/` — mounted volume persists between container restarts
- `uploadFromAgent` is in the unauthenticated `agent` prefix group — only accessible from within the Docker network
- Logout URLs are best-guess; if SAT changes them the logout step fails silently (non-fatal)
- ~133KB × 2 types × 60 clients × 12 months ≈ **190MB/year** on disk — very manageable
- The `Robot FIEL` button on InvoicesPage toolbar still works; `SatDocumentsPage` has its own copy for convenience
