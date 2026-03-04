
// Configuración base para la API
// Llamamos directamente al backend para evitar el límite de 4.5MB del proxy de Vercel
// El backend tiene CORS configurado con allowed_origins: ['*']
export const API_BASE_URL = 'https://api.fiscalio.cloud';
