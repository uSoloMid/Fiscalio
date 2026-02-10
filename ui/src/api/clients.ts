
export interface ClientFilterParams {
    q?: string;
    group_id?: string | number | null;
    tag_ids?: (string | number)[];
    sort?: string;
    page?: number;
    pageSize?: number;
}

export async function listClients(params: ClientFilterParams): Promise<any> {
    const query = new URLSearchParams();
    if (params.q) query.append('q', params.q);
    if (params.group_id !== undefined) query.append('group_id', String(params.group_id));
    if (params.tag_ids && params.tag_ids.length > 0) query.append('tag_ids', params.tag_ids.join(','));
    if (params.sort) query.append('sort', params.sort);
    if (params.page) query.append('page', String(params.page));
    if (params.pageSize) query.append('pageSize', String(params.pageSize));

    const response = await fetch('/api/clients?' + query.toString());
    if (!response.ok) throw new Error('Error fetching clients');
    return response.json();
}

export async function updateClientGroup(clientId: number, groupId: number | null): Promise<any> {
    const response = await fetch(`/api/clients/${clientId}/group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId })
    });
    if (!response.ok) throw new Error('Error updating client group');
    return response.json();
}

export async function updateClientTags(clientId: number, tagIds: number[]): Promise<any> {
    const response = await fetch(`/api/clients/${clientId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: tagIds })
    });
    if (!response.ok) throw new Error('Error updating client tags');
    return response.json();
}

export async function updateClientInfo(clientId: number, data: any): Promise<any> {
    const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Error updating client info');
    return response.json();
}

export async function deleteClient(clientId: number): Promise<any> {
    const response = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting client');
    return response.json();
}
