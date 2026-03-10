import sys
import re

path = r'c:\Fiscalio\ui\src\services.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Normalize newlines
content = content.replace('\r\n', '\n')

header = '''import type { Cfdi, CfdiPagination } from './models';
import { API_BASE_URL } from './api/config';

export function getToken(): string | null {
    return localStorage.getItem('auth_token');
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = options.headers ? new Headers(options.headers) : new Headers();
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
'''

target_head = '''import type { Cfdi, CfdiPagination } from './models';
import { API_BASE_URL } from './api/config';
'''

if target_head in content:
    content = content.replace(target_head, header)
    # Replace all raw fetch wrapped with API_BASE_URL
    # example: fetch(`${API_BASE_URL}/api/cfdis...
    content = re.sub(r'fetch\(`\$\{API_BASE_URL\}(.*?)`\)', r'authFetch(`${API_BASE_URL}\1`)', content)
    content = re.sub(r'fetch\(`\$\{API_BASE_URL\}(.*?)`,\s*\{', r'authFetch(`${API_BASE_URL}\1`, {', content)
    
    # Unreplace the one internal to login that we need as raw
    content = content.replace('authFetch(`${API_BASE_URL}/api/login`', 'fetch(`${API_BASE_URL}/api/login`')
    
    # We also have window.open for PDF/Excel. They will throw auth error if we don't send auth.
    # To fix PDF downloads with Sanctum, the standard way in React is to fetch as Blob and create object URL.
    # But since that is a bigger refactor, we can pass ?token= and have a minimal middleware in Laravel to allow it for those specific routes (or just do it properly now since it's just 4 methods).

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched services.ts")
else:
    print("Could not find header")

