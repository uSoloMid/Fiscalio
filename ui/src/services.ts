import type { Cfdi, CfdiPagination } from './models';
import { API_BASE_URL, DIRECT_API_URL } from './api/config';

export function getToken(): string | null {
    return localStorage.getItem('auth_token');
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = options.headers ? new Headers(options.headers) : new Headers();
    headers.set('Accept', 'application/json');
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    options.headers = headers;

    let base = url;
    if (url.startsWith('/api')) {
        base = API_BASE_URL + url;
    }

    const response = await fetch(base, options);
    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        window.dispatchEvent(new Event('auth_token_expired'));
    }
    return response;
}

export async function login(email: string, password: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || 'Error login');
    return data;
}

export async function logout(): Promise<void> {
    await authFetch(`${API_BASE_URL}/api/logout`, { method: 'POST' });
    localStorage.removeItem('auth_token');
    window.dispatchEvent(new Event('auth_token_expired'));
}

export async function listCfdis(params: any): Promise<CfdiPagination> {
    const query = new URLSearchParams();
    if (params.rfc_emisor) query.append('rfc_emisor', params.rfc_emisor);
    if (params.rfc_receptor) query.append('rfc_receptor', params.rfc_receptor);
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    if (params.rfc_user) query.append('rfc_user', params.rfc_user);
    if (params.tipo && params.tipo !== 'all') query.append('tipo', params.tipo); // Explicitly exclude 'all' just in case
    if (params.page) query.append('page', params.page.toString());
    if (params.q) query.append('q', params.q);
    if (params.status) query.append('status', params.status);
    if (params.cfdi_tipo) query.append('cfdi_tipo', params.cfdi_tipo);
    if (params.pageSize) query.append('pageSize', params.pageSize.toString());
    if (params.reconciliacion) query.append('reconciliacion', params.reconciliacion);

    const response = await authFetch(`${API_BASE_URL}/api/cfdis?${query.toString()}`);
    if (!response.ok) {
        throw new Error('Error fetching CFDIs');
    }
    return response.json();
}

export async function suggestCfdis(q: string, rfcUser: string): Promise<any[]> {
    if (q.length < 2) return [];
    const params = new URLSearchParams({ q, rfc_user: rfcUser });
    const response = await authFetch(`${API_BASE_URL}/api/cfdis/suggest?${params}`);
    if (!response.ok) return [];
    return response.json();
}

export async function getCfdi(uuid: string): Promise<{ metadata: Cfdi, xml_url: string, sat_response?: any }> {
    const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}`);
    if (!response.ok) {
        throw new Error('Error fetching CFDI detail');
    }
    return response.json();
}

export async function refreshCfdiStatus(uuid: string): Promise<{ metadata: Cfdi, sat_response: any }> {
    const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}/refresh-status`, {
        method: 'POST'
    });
    if (!response.ok) {
        throw new Error('Error refreshing CFDI status');
    }
    return response.json();
}

export async function getPeriods(rfcUser: string): Promise<string[]> {
    const response = await authFetch(`${API_BASE_URL}/api/cfdis/periods?rfc_user=${rfcUser}`);
    if (!response.ok) {
        throw new Error('Error fetching periods');
    }
    return response.json(); // Returns array of strings ['YYYY-MM', ...]
}

export async function listClients(): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/clients`);
    if (!response.ok) throw new Error('Error fetching clients');
    return response.json();
}

export async function parseCertificate(file: File): Promise<{ rfc: string, name: string, valid_until: string }> {
    const formData = new FormData();
    formData.append('certificate', file);
    const response = await authFetch(`${API_BASE_URL}/api/clients/parse-certificate`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error parsing certificate');
    }
    return response.json();
}

export async function createClient(data: FormData): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/clients`, {
        method: 'POST',
        body: data
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error creating client');
    }
    return response.json();
}
export async function startSync(rfc: string, force: boolean = false): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc, force })
    });
    if (!response.ok) throw new Error('Error starting sync');
    return response.json();
}

export async function triggerScraperFiel(rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/scrape-fiel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Error ejecutando el scraper de la FIEL');
    }
    return response.json();
}

export async function createManualRequest(rfc: string, start_date: string, end_date: string, type: string = 'all'): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/manual-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc, start_date, end_date, type })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Error creando solicitud manual');
    }
    return response.json();
}

export async function verifyStatus(params: any): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/verify-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    if (!response.ok) throw new Error('Error verifying statuses');
    return response.json();
}

export async function getActiveRequests(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/active-requests?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching active requests');
    return response.json();
}

export async function listAccounts(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching accounts');
    return response.json();
}

export async function getAccount(id: number, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching account');
    return response.json();
}

export async function createAccount(data: any, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts?rfc=${rfc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error creating account');
    }
    return response.json();
}

export async function updateAccount(id: number, data: any, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error updating account');
    }
    return response.json();
}

export async function deleteAccount(id: number, rfc: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting account');
}

export async function exportAccountsExcel(rfc: string, clientName?: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/accounts/export?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error al exportar catálogo');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Catalogo_${clientName || rfc}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
}

export async function importAccountsTxt(file: File, rfc: string, mode: 'upsert' | 'new_only' = 'upsert'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rfc', rfc);
    formData.append('mode', mode);

    const response = await authFetch(`${API_BASE_URL}/api/accounts/import-txt`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Error al importar catálogo TXT');
    }
    return response.json();
}

export async function importAccountsExcel(file: File, rfc: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('rfc', rfc);

    const response = await authFetch(`${API_BASE_URL}/api/accounts/import`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Error al importar catálogo');
    }
    return response.json();
}

export async function getRecentRequests(): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/recent-requests`);
    if (!response.ok) throw new Error('Error fetching recent requests');
    return response.json();
}

export async function getRunnerStatus(): Promise<{ is_alive: boolean; last_activity: string | null }> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/runner-status`);
    if (!response.ok) throw new Error('Error fetching runner status');
    return response.json();
}

export async function fillSatGaps(rfc?: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/fill-gaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc }),
    });
    if (!response.ok) throw new Error('Error al rellenar huecos');
    return response.json();
}

export async function getSatCoverage(rfc?: string): Promise<any[]> {
    const q = rfc ? `?rfc=${encodeURIComponent(rfc)}` : '';
    const response = await authFetch(`${API_BASE_URL}/api/sat/coverage${q}`);
    if (!response.ok) throw new Error('Error al obtener cobertura');
    return response.json();
}

export async function listSatRequests(params: any = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.rfc) query.append('rfc', params.rfc);
    if (params.page) query.append('page', params.page);

    const response = await authFetch(`${API_BASE_URL}/api/sat/requests?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching requests');
    return response.json();
}

export async function deleteSatRequest(id: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/requests/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting request');
}

export async function bulkDeleteSatRequests(rfc?: string): Promise<any> {
    const query = rfc ? `?rfc=${rfc}` : '';
    const response = await authFetch(`${API_BASE_URL}/api/sat/requests-bulk${query}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting requests');
    return response.json();
}

export async function verifySatRequest(id: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/sat/requests/${id}/verify`, {
        method: 'POST'
    });
    if (!response.ok) {
        let err;
        try { err = await response.json(); } catch (e) { }
        throw new Error(err?.error || err?.message || 'Error al verificar solicitud');
    }
    return response.json();
}

export async function getProvisionalSummary(rfc: string, year: number, month: number): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/provisional/summary?rfc=${rfc}&year=${year}&month=${month}`);
    if (!response.ok) throw new Error('Error fetching summary');
    return response.json();
}

export async function listPpdExplorer(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await authFetch(`${API_BASE_URL}/api/provisional/ppd-explorer?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching PPD explorer');
    return response.json();
}

export async function listRepExplorer(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await authFetch(`${API_BASE_URL}/api/provisional/rep-explorer?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching REP explorer');
    return response.json();
}

export async function getBucketDetails(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await authFetch(`${API_BASE_URL}/api/provisional/bucket-details?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching bucket details');
    return response.json();
}

export async function updateDeductibility(uuid: string, data: { is_deductible: boolean, deduction_type?: string }): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}/update-deductibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error updating deductibility');
}

export async function uploadCfdis(files: FileList | File[], rfcUser: string): Promise<any> {
    const formData = new FormData();
    formData.append('rfc_user', rfcUser);
    for (let i = 0; i < files.length; i++) {
        formData.append('files[]', files[i]);
    }
    const res = await authFetch(`${API_BASE_URL}/api/cfdis/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        throw new Error('Error al subir los archivos');
    }
    return res.json();
}

export async function exportCfdiPdf(uuid: string) { await downloadBlob(`${API_BASE_URL}/api/cfdis/${uuid}/pdf`, `CFDI_${uuid}.pdf`); }
export async function exportCfdiXml(uuid: string) { await downloadBlob(`${API_BASE_URL}/api/cfdis/${uuid}/xml`, `CFDI_${uuid}.xml`); }
export async function exportCfdiZip(uuid: string) { await downloadBlob(`${API_BASE_URL}/api/cfdis/${uuid}/zip`, `CFDI_${uuid}.zip`); }

export async function exportDetailedBucketPdf(params: any) { const q = new URLSearchParams(params); await downloadBlob(`${API_BASE_URL}/api/provisional/export-pdf?${q}`, `Detalle_${params.bucket}.pdf`); }

export async function exportInvoicesZip(params: any) {
    const query = new URLSearchParams();
    if (params.rfc_user) query.append('rfc_user', params.rfc_user);
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    if (params.tipo && params.tipo !== 'all') query.append('tipo', params.tipo);
    if (params.q) query.append('q', params.q);
    if (params.status) query.append('status', params.status);

    await downloadBlob(`${API_BASE_URL}/api/sat/bulk-pdf?${query.toString()}`, 'Facturas.zip');
}
export async function downloadProvisionalXmlZip(rfc: string, periods: { year: number, month: number }[], types: string[] = ['emitidas', 'recibidas']): Promise<Blob> {
    const response = await authFetch(`${API_BASE_URL}/api/provisional/download-xml?rfc=${rfc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periods, types })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error downloading XML ZIP');
    }
    return response.blob();
}

export async function exportCfdisExcel(params: any, columns: string[]) {
    const query = new URLSearchParams();
    if (params.rfc_user) query.append('rfc_user', params.rfc_user);
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    if (params.tipo && params.tipo !== 'all') query.append('tipo', params.tipo);
    if (params.q) query.append('q', params.q);
    if (params.status) query.append('status', params.status);
    if (params.cfdi_tipo) query.append('cfdi_tipo', params.cfdi_tipo);

    query.append('columns', columns.join(','));

    // Trigger download
    await downloadBlob(`${API_BASE_URL}/api/cfdis/export?${query.toString()}`, 'Facturas.xls');
}
export async function exportProvisionalExcel(params: { rfc: string, year: number, month: number }) {
    const query = new URLSearchParams();
    query.append('rfc', params.rfc);
    query.append('year', params.year.toString());
    query.append('month', params.month.toString());
    await downloadBlob(`${API_BASE_URL}/api/provisional/export-excel?${query.toString()}`, `Resumen_${params.month}_${params.year}.xls`);
}

export async function exportProvisionalPdfSummary(params: { rfc: string, year: number, month: number }) {
    const query = new URLSearchParams();
    query.append('rfc', params.rfc);
    query.append('year', params.year.toString());
    query.append('month', params.month.toString());
    await downloadBlob(`${API_BASE_URL}/api/provisional/export-pdf-summary?${query.toString()}`, `Resumen_${params.month}_${params.year}.pdf`);
}

export async function downloadBlob(url: string, filename: string) {
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Error en la descarga');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function processBankStatement(file: File, rfc: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('business_rfc', rfc);
    formData.append('rfc', rfc);

    const response = await authFetch(`${DIRECT_API_URL}/api/bank-statements/process`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Error al procesar el estado de cuenta');
    }
    return response.json();
}

export async function confirmBankStatement(data: any, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-statements/confirm?rfc=${rfc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error al confirmar el estado de cuenta');
    return response.json();
}

export async function listBankStatements(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-statements?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error al listar estados de cuenta');
    return response.json();
}

export async function getBankStatement(id: number, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-statements/${id}?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error al obtener estado de cuenta');
    return response.json();
}

export async function updateBankMovement(id: number, data: any, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-movements/${id}?rfc=${rfc}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error al actualizar movimiento');
    return response.json();
}
export async function getReconciliationSuggestions(statementId: number, rfc: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/reconciliation/suggest/${statementId}?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error al obtener sugerencias de conciliación');
    return response.json();
}

export async function reconcileMovement(movementId: number, cfdiId: number, confidence: string): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-movements/${movementId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfdi_id: cfdiId, confidence }),
    });
    if (!response.ok) throw new Error('Error al conciliar movimiento');
    return response.json();
}

export async function unreconcileMovement(movementId: number, cfdiId?: number): Promise<any> {
    const url = cfdiId
        ? `${API_BASE_URL}/api/bank-movements/${movementId}/reconcile?cfdi_id=${cfdiId}`
        : `${API_BASE_URL}/api/bank-movements/${movementId}/reconcile`;
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al desconciliar movimiento');
    return response.json();
}

export async function searchCfdisManual(rfc: string, q: string, direction: 'egreso' | 'ingreso'): Promise<any> {
    const params = new URLSearchParams({ rfc, q, direction });
    const response = await authFetch(`${API_BASE_URL}/api/reconciliation/search?${params}`);
    if (!response.ok) throw new Error('Error al buscar CFDIs');
    return response.json();
}

export async function getPendingReconciliationReport(rfc: string, from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams({ rfc });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);
    const response = await authFetch(`${API_BASE_URL}/api/reconciliation/pending-report?${params}`);
    if (!response.ok) throw new Error('Error al obtener reporte de pendientes');
    return response.json();
}

export async function deleteBankStatement(id: number, rfc: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/bank-statements/${id}?rfc=${rfc}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error al eliminar estado de cuenta');
}

export async function getBusinessNotes(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/clients/${rfc}/notes`);
    if (!response.ok) return [];
    return response.json();
}

export async function resolveBusinessNote(noteId: number): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/api/clients/notes/${noteId}/resolve`, { method: 'POST' });
    if (!response.ok) throw new Error('Error al resolver nota');
}

export async function listSatDocuments(rfc: string): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/sat-documents?rfc=${encodeURIComponent(rfc)}`);
    if (!response.ok) throw new Error('Error cargando documentos SAT');
    return response.json();
}

export async function getMissingDocs(): Promise<{ missing_csf: any[], missing_opinion: any[], negative_opinions: any[] }> {
    const response = await authFetch(`${API_BASE_URL}/api/sat-documents/missing`);
    if (!response.ok) return { missing_csf: [], missing_opinion: [], negative_opinions: [] };
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

// Manual Scraper (Node Scraper)
export async function listScraperManual(): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/scraper-manual`);
    if (!response.ok) throw new Error('Error cargando historial del scraper');
    return response.json();
}

export async function getScraperStats(): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/scraper-manual/stats`);
    if (!response.ok) throw new Error('Error cargando estadísticas del scraper');
    return response.json();
}

export async function bulkQueueScraper(): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/scraper-manual/bulk`, { method: 'POST' });
    if (!response.ok) throw new Error('Error al iniciar cola masiva');
    return response.json();
}

export async function resetScraperQueue(): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/scraper-manual/reset`, { method: 'POST' });
    if (!response.ok) throw new Error('Error al reiniciar cola');
    return response.json();
}

// ── Usuario actual ────────────────────────────────────────────────────────────
export async function getCurrentUser(): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/user`);
    if (!response.ok) return null;
    return response.json();
}

// ── Gestión de usuarios (solo admin) ─────────────────────────────────────────
export async function listUsers(): Promise<any[]> {
    const response = await authFetch(`${API_BASE_URL}/api/users`);
    if (!response.ok) throw new Error('Error cargando usuarios');
    return response.json();
}

export async function createUser(data: { name: string; email: string; password: string; is_admin?: boolean }): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || Object.values(err.errors ?? {})[0] || 'Error al crear usuario');
    }
    return response.json();
}

export async function updateUser(id: number, data: { name?: string; email?: string; password?: string }): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al actualizar usuario');
    }
    return response.json();
}

export async function deleteUser(id: number): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/users/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Error al eliminar usuario');
    return response.json();
}

export async function syncUserBusinesses(userId: number, businessIds: number[]): Promise<any> {
    const response = await authFetch(`${API_BASE_URL}/api/users/${userId}/businesses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_ids: businessIds }),
    });
    if (!response.ok) throw new Error('Error al asignar clientes');
    return response.json();
}
