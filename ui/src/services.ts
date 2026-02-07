import type { Cfdi, CfdiPagination } from './models';

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

    const response = await fetch('/api/cfdis?' + query.toString());
    if (!response.ok) {
        throw new Error('Error fetching CFDIs');
    }
    return response.json();
}

export async function getCfdi(uuid: string): Promise<{ metadata: Cfdi, xml_url: string, sat_response?: any }> {
    const response = await fetch('/api/cfdis/' + uuid);
    if (!response.ok) {
        throw new Error('Error fetching CFDI detail');
    }
    return response.json();
}

export async function refreshCfdiStatus(uuid: string): Promise<{ metadata: Cfdi, sat_response: any }> {
    const response = await fetch('/api/cfdis/' + uuid + '/refresh-status', {
        method: 'POST'
    });
    if (!response.ok) {
        throw new Error('Error refreshing CFDI status');
    }
    return response.json();
}

export async function getPeriods(rfcUser: string): Promise<string[]> {
    const response = await fetch('/api/cfdis/periods?rfc_user=' + rfcUser);
    if (!response.ok) {
        throw new Error('Error fetching periods');
    }
    return response.json(); // Returns array of strings ['YYYY-MM', ...]
}

export async function listClients(): Promise<any[]> {
    const response = await fetch('/api/clients');
    if (!response.ok) throw new Error('Error fetching clients');
    return response.json();
}

export async function parseCertificate(file: File): Promise<{ rfc: string, name: string, valid_until: string }> {
    const formData = new FormData();
    formData.append('certificate', file);
    const response = await fetch('/api/clients/parse-certificate', {
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
    const response = await fetch('/api/clients', {
        method: 'POST',
        body: data
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error creating client');
    }
    return response.json();
}
export async function startSync(rfc: string): Promise<any> {
    const response = await fetch('/api/sat/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc })
    });
    if (!response.ok) throw new Error('Error starting sync');
    return response.json();
}

export async function verifyStatus(rfc: string): Promise<any> {
    const response = await fetch('/api/sat/verify-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc })
    });
    if (!response.ok) throw new Error('Error verifying statuses');
    return response.json();
}

export async function getActiveRequests(rfc: string): Promise<any[]> {
    const response = await fetch('/api/sat/active-requests?rfc=' + rfc);
    if (!response.ok) throw new Error('Error fetching active requests');
    return response.json();
}
