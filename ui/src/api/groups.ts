
export async function listGroups(): Promise<any[]> {
    const response = await fetch('/api/groups');
    if (!response.ok) throw new Error('Error fetching groups');
    return response.json();
}

export async function createGroup(name: string, color?: string): Promise<any> {
    const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    if (!response.ok) throw new Error('Error creating group');
    return response.json();
}

export async function updateGroup(id: number, name: string, color?: string): Promise<any> {
    const response = await fetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    if (!response.ok) throw new Error('Error updating group');
    return response.json();
}

export async function deleteGroup(id: number): Promise<any> {
    const response = await fetch(`/api/groups/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting group');
    return response.json();
}
