
// Configuración base para la API
// API_BASE_URL vacío fuerza el uso del Proxy de Vercel (vercel.json) para evitar CORS
// NO cambiar a una URL directa — rompería autenticación y CORS
export const API_BASE_URL = '';

// URL directa al backend (solo para uploads grandes que superan el límite de 4.5MB de Vercel)
export const DIRECT_API_URL = 'https://api.fiscalio.cloud';
