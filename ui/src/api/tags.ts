
export async function listTags(): Promise<any[]> {
    const response = await fetch('/api/tags');
    if (!response.ok) throw new Error('Error fetching tags');
    return response.json();
}

export async function createTag(name: string, color?: string): Promise<any> {
    const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    });
    if (!response.ok) throw new Error('Error creating tag');
    return response.json();
}
