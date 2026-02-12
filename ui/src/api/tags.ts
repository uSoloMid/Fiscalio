
import { API_BASE_URL } from './config';

export async function listTags(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/tags`);
    if (!response.ok) throw new Error('Error fetching tags');
    return response.json();
}

export async function createTag(name: string, color?: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    if (!response.ok) throw new Error('Error creating tag');
    return response.json();
}

export async function updateTag(id: number, name: string, color?: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    if (!response.ok) throw new Error('Error updating tag');
    return response.json();
}

export async function deleteTag(id: number): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/tags/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error deleting tag');
    return response.json();
}
