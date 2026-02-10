import { useEffect, useState } from 'react';
import { listSatRequests } from '../services';

interface SatRequest {
    id: string;
    rfc: string;
    business_name: string;
    type: string;
    start_date: string;
    end_date: string;
    state: string;
    created_at: string;
    updated_at: string;
    package_count: number;
}

export function SatRequestsHistoryPage({ onBack }: { onBack: () => void }) {
    const [requests, setRequests] = useState<SatRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await listSatRequests({ page });
            setRequests(data.data);
            setTotalPages(data.last_page);
        } catch (error) {
            console.error('Error loading requests', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [page]);

    const getStatusColor = (state: string) => {
        switch (state) {
            case 'completed': return 'text-green-600 bg-green-50';
            case 'downloading': return 'text-orange-600 bg-orange-50';
            case 'error': return 'text-red-600 bg-red-50';
            default: return 'text-yellow-600 bg-yellow-50';
        }
    };

    const getStatusLabel = (state: string) => {
        switch (state) {
            case 'completed': return 'Completada';
            case 'downloading': return 'Descargando';
            case 'error': return 'Error';
            case 'created': return 'En cola';
            case 'polling': return 'En proceso';
            default: return state;
        }
    };

    const getTypeLabel = (type: string) => {
        return type === 'issued' ? 'EMITIDAS' : 'RECIBIDAS';
    };

    const getTypeColor = (type: string) => {
        return type === 'issued'
            ? 'text-blue-600 bg-blue-50 border-blue-200'
            : 'text-purple-600 bg-purple-50 border-purple-200';
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString();
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-['Inter']">
            <header className="bg-white border-b border-gray-100 flex-shrink-0">
                <div className="h-20 flex items-center justify-between px-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600 transition-all"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Historial de Solicitudes SAT</h1>
                            <p className="text-xs text-gray-500 font-medium">Registro completo de descargas y auditorías</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-10 overflow-y-auto">
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                                <tr>
                                    <th className="px-8 py-5">Cliente</th>
                                    <th className="px-8 py-5">Tipo</th>
                                    <th className="px-8 py-5">Periodo Solicitado</th>
                                    <th className="px-8 py-5">Estado</th>
                                    <th className="px-8 py-5">Paquetes</th>
                                    <th className="px-8 py-5">Fecha Solicitud</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-8 py-5">
                                            <div className="font-bold text-gray-900">{req.business_name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono tracking-tighter">{req.rfc}</div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider ${getTypeColor(req.type)}`}>
                                                {getTypeLabel(req.type)}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-gray-600 font-medium whitespace-nowrap">
                                            {formatDate(req.start_date)} — {formatDate(req.end_date)}
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full w-fit ${getStatusColor(req.state)}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full bg-current ${req.state !== 'completed' && req.state !== 'error' ? 'animate-pulse' : ''}`} />
                                                <span className="font-bold text-[10px] uppercase tracking-wider">{getStatusLabel(req.state)}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <div className="font-bold text-gray-700">{req.package_count}</div>
                                            <div className="text-[10px] text-gray-400 uppercase">SAT Packages</div>
                                        </td>
                                        <td className="px-8 py-5 text-gray-500 text-xs">
                                            {new Date(req.created_at).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {requests.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-20 text-center">
                                            <span className="material-symbols-outlined text-gray-200 text-6xl mb-4">history</span>
                                            <p className="text-gray-400 font-medium">No se han encontrado solicitudes en el historial.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Página {page} de {totalPages}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(p => p - 1)}
                                    className="p-2 border border-gray-200 rounded-xl bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <span className="material-symbols-outlined">chevron_left</span>
                                </button>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => p + 1)}
                                    className="p-2 border border-gray-200 rounded-xl bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
