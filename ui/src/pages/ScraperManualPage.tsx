import { useEffect, useState } from 'react';
import { listScraperManual, getScraperStats, bulkQueueScraper, resetScraperQueue } from '../services';

interface ScraperRequest {
    id: number;
    rfc: string;
    type: string;
    start_date: string;
    end_date: string;
    status: string;
    xml_count: number;
    error: string | null;
    created_at: string;
    business?: {
        legal_name: string;
    };
}

export function ScraperManualPage({ onBack }: { onBack: () => void }) {
    const [requests, setRequests] = useState<ScraperRequest[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isQueuing, setIsQueuing] = useState(false);

    const fetchData = async () => {
        try {
            const [reqs, st] = await Promise.all([
                listScraperManual(),
                getScraperStats()
            ]);
            setRequests(reqs);
            setStats(st);
        } catch (error) {
            console.error('Error loading scraper data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleBulkQueue = async () => {
        if (!confirm('¿Iniciar descarga masiva para TODOS los clientes (Feb - Mar 11)?')) return;
        try {
            setIsQueuing(true);
            await bulkQueueScraper();
            await fetchData();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsQueuing(false);
        }
    };

    const handleReset = async () => {
        try {
            await resetScraperQueue();
            await fetchData();
        } catch (error: any) {
            alert(error.message);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'text-green-600 bg-green-50';
            case 'processing': return 'text-blue-600 bg-blue-50';
            case 'failed': return 'text-red-600 bg-red-50';
            default: return 'text-yellow-600 bg-yellow-50';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter']">
            <header className="bg-white border-b border-gray-100 py-4 px-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Scrapper Manual (Node)</h1>
                        <p className="text-xs text-gray-500">Cola de descarga masiva de XMLs</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {stats && (
                        <div className="flex gap-4 mr-6 border-r pr-6 border-gray-100">
                            <div className="text-center">
                                <div className="text-[10px] uppercase font-black text-gray-400">Pendientes</div>
                                <div className="font-bold text-yellow-600">{stats.pending}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] uppercase font-black text-gray-400">Procesando</div>
                                <div className="font-bold text-blue-600">{stats.processing}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] uppercase font-black text-gray-400">Completados</div>
                                <div className="font-bold text-green-600">{stats.completed}</div>
                            </div>
                        </div>
                    )}
                    
                    <button 
                        onClick={handleReset}
                        className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                    >
                        Reiniciar Fallidos
                    </button>

                    <button
                        onClick={handleBulkQueue}
                        disabled={isQueuing}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-all disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-sm">rocket_launch</span>
                        SOLICITAR TODOS (FEB-MAR)
                    </button>
                </div>
            </header>

            <main className="flex-1 p-10 overflow-auto">
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-5">Pos.</th>
                                <th className="px-6 py-5">Cliente</th>
                                <th className="px-6 py-5">RFC</th>
                                <th className="px-6 py-5">Tipo</th>
                                <th className="px-6 py-5">Rango</th>
                                <th className="px-6 py-5 text-center">Facturas</th>
                                <th className="px-6 py-5">Estado</th>
                                <th className="px-6 py-5">Fecha Solicitud</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {requests.map((req, index) => (
                                <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-300">
                                        {req.status === 'pending' ? index + 1 : '—'}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-900">
                                        {req.business?.legal_name || '—'}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                                        {req.rfc}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${req.type === 'issued' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                            {req.type === 'issued' ? 'Emitidas' : 'Recibidas'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-600">
                                        {req.start_date} al {req.end_date}
                                    </td>
                                    <td className="px-6 py-4 text-center font-bold text-gray-700">
                                        {req.xml_count}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${getStatusColor(req.status)}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full bg-current ${req.status === 'processing' ? 'animate-pulse' : ''}`} />
                                            <span className="text-[10px] font-bold uppercase">{req.status}</span>
                                        </div>
                                        {req.error && <p className="text-[9px] text-red-500 mt-1 max-w-[150px] truncate">{req.error}</p>}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-400">
                                        {new Date(req.created_at).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                            {requests.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={8} className="py-20 text-center text-gray-400">
                                        No hay solicitudes en cola.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
