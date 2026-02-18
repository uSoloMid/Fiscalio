import type { Cfdi, CfdiPagination } from './models';
import { API_BASE_URL } from './api/config';

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

    const response = await fetch(`${API_BASE_URL}/api/cfdis?${query.toString()}`);
    if (!response.ok) {
        throw new Error('Error fetching CFDIs');
    }
    return response.json();
}

export async function getCfdi(uuid: string): Promise<{ metadata: Cfdi, xml_url: string, sat_response?: any }> {
    const response = await fetch(`${API_BASE_URL}/api/cfdis/${uuid}`);
    if (!response.ok) {
        throw new Error('Error fetching CFDI detail');
    }
    return response.json();
}

export async function refreshCfdiStatus(uuid: string): Promise<{ metadata: Cfdi, sat_response: any }> {
    const response = await fetch(`${API_BASE_URL}/api/cfdis/${uuid}/refresh-status`, {
        method: 'POST'
    });
    if (!response.ok) {
        throw new Error('Error refreshing CFDI status');
    }
    return response.json();
}

export async function getPeriods(rfcUser: string): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/cfdis/periods?rfc_user=${rfcUser}`);
    if (!response.ok) {
        throw new Error('Error fetching periods');
    }
    return response.json(); // Returns array of strings ['YYYY-MM', ...]
}

export async function listClients(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/clients`);
    if (!response.ok) throw new Error('Error fetching clients');
    return response.json();
}

export async function parseCertificate(file: File): Promise<{ rfc: string, name: string, valid_until: string }> {
    const formData = new FormData();
    formData.append('certificate', file);
    const response = await fetch(`${API_BASE_URL}/api/clients/parse-certificate`, {
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
    const response = await fetch(`${API_BASE_URL}/api/clients`, {
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
    const response = await fetch(`${API_BASE_URL}/api/sat/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc, force })
    });
    if (!response.ok) throw new Error('Error starting sync');
    return response.json();
}

export async function verifyStatus(params: any): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/sat/verify-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    if (!response.ok) throw new Error('Error verifying statuses');
    return response.json();
}

export async function getActiveRequests(rfc: string): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/sat/active-requests?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching active requests');
    return response.json();
}

export async function listAccounts(rfc: string): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/accounts?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching accounts');
    return response.json();
}

export async function getAccount(id: number, rfc: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`);
    if (!response.ok) throw new Error('Error fetching account');
    return response.json();
}

export async function createAccount(data: any, rfc: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/accounts?rfc=${rfc}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`, {
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
    const response = await fetch(`${API_BASE_URL}/api/accounts/${id}?rfc=${rfc}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting account');
}

export async function getRecentRequests(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/sat/recent-requests`);
    if (!response.ok) throw new Error('Error fetching recent requests');
    return response.json();
}

export async function listSatRequests(params: any = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.rfc) query.append('rfc', params.rfc);
    if (params.page) query.append('page', params.page);

    const response = await fetch(`${API_BASE_URL}/api/sat/requests?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching requests');
    return response.json();
}

export async function deleteSatRequest(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sat/requests/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting request');
}

export async function getProvisionalSummary(rfc: string, year: number, month: number): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/provisional/summary?rfc=${rfc}&year=${year}&month=${month}`);
    if (!response.ok) throw new Error('Error fetching summary');
    return response.json();
}

export async function listPpdExplorer(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await fetch(`${API_BASE_URL}/api/provisional/ppd-explorer?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching PPD explorer');
    return response.json();
}

export async function listRepExplorer(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await fetch(`${API_BASE_URL}/api/provisional/rep-explorer?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching REP explorer');
    return response.json();
}

export async function getBucketDetails(params: any): Promise<any> {
    const query = new URLSearchParams(params);
    const response = await fetch(`${API_BASE_URL}/api/provisional/bucket-details?${query.toString()}`);
    if (!response.ok) throw new Error('Error fetching bucket details');
    return response.json();
}

export async function updateDeductibility(uuid: string, data: { is_deductible: boolean, deduction_type?: string }): Promise<void> {
    const response = await fetch(`/api/cfdis/${uuid}/update-deductibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error updating deductibility');
}

export function exportCfdiPdf(uuid: string) {
    window.open(`/api/cfdis/${uuid}/pdf`, '_blank');
}

export function exportDetailedBucketPdf(params: any) {
    const query = new URLSearchParams(params);
    window.open('/api/provisional/export-pdf?' + query.toString(), '_blank');
}

export function exportInvoicesZip(params: any) {
    const query = new URLSearchParams();
    if (params.rfc_user) query.append('rfc_user', params.rfc_user);
    if (params.year) query.append('year', params.year);
    if (params.month) query.append('month', params.month);
    if (params.tipo && params.tipo !== 'all') query.append('tipo', params.tipo);
    if (params.q) query.append('q', params.q);
    if (params.status) query.append('status', params.status);

    window.open(`${API_BASE_URL}/api/sat/bulk-pdf?${query.toString()}`, '_blank');
}
export async function downloadProvisionalXmlZip(rfc: string, periods: { year: number, month: number }[], types: string[] = ['emitidas', 'recibidas']): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/api/provisional/download-xml?rfc=${rfc}`, {
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

export function exportCfdisExcel(params: any, columns: string[]) {
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
    window.open(`${API_BASE_URL}/api/cfdis/export?${query.toString()}`, '_blank');
}
export function exportProvisionalExcel(params: { rfc: string, year: number, month: number }) {
    const query = new URLSearchParams();
    query.append('rfc', params.rfc);
    query.append('year', params.year.toString());
    query.append('month', params.month.toString());
    window.open(`${API_BASE_URL}/api/provisional/export-excel?${query.toString()}`, '_blank');
}

export function exportProvisionalPdfSummary(params: { rfc: string, year: number, month: number }) {
    const query = new URLSearchParams();
    query.append('rfc', params.rfc);
    query.append('year', params.year.toString());
    query.append('month', params.month.toString());
    window.open(`${API_BASE_URL}/api/provisional/export-pdf-summary?${query.toString()}`, '_blank');
}
