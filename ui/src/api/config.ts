
// Configuración base para la API
// En producción (Vercel), VITE_API_URL debe apuntar al backend de Render (ej. https://fiscalio-re4i.onrender.com)
// En desarrollo local, se deja vacío para usar el proxy de Vite configurado en vite.config.ts

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.fiscalio.cloud';
