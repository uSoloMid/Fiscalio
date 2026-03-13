import axios, { AxiosInstance } from 'axios';

export class SatApiService {
    private client: AxiosInstance;
    private baseUrl: string;

    constructor(baseUrl: string = 'http://localhost:8080/api') {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    async query(start: string, end: string, type: 'cfdi' | 'metadata' = 'cfdi'): Promise<string> {
        try {
            const response = await this.client.post('/sat/query', { start, end, type });
            if (response.data.success) {
                return response.data.requestId;
            }
            throw new Error(response.data.message || 'Unknown error during query');
        } catch (error: any) {
            console.error('SatApiService query error:', error.response?.data || error.message);
            throw error;
        }
    }

    async verify(requestId: string): Promise<any> {
        try {
            const response = await this.client.get(`/sat/verify/${requestId}`);
            if (response.data.success) {
                return response.data;
            }
            throw new Error(response.data.message || 'Unknown error during verification');
        } catch (error: any) {
            console.error('SatApiService verify error:', error.response?.data || error.message);
            throw error;
        }
    }

    async download(packageId: string): Promise<string> {
        try {
            const response = await this.client.get(`/sat/download/${packageId}`);
            if (response.data.success) {
                return response.data.content; // Base64 content
            }
            throw new Error(response.data.message || 'Unknown error during download');
        } catch (error: any) {
            console.error('SatApiService download error:', error.response?.data || error.message);
            throw error;
        }
    }
}
