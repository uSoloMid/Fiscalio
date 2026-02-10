import { useEffect, useState } from 'react';
import { getRecentRequests } from '../services';

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

export function RecentRequests({ onViewHistory }: { onViewHistory: () => void }) {
    const [requests, setRequests] = useState<SatRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRequests = async () => {
        try {
            const data = await getRecentRequests();
            // Show only last 4
            setRequests(data.slice(0, 4));
        } catch (error) {
            console.error('Error loading requests', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
        const interval = setInterval(fetchRequests, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

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

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return `Hace ${seconds} seg`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Hace ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours} horas`;
        return formatDate(dateStr);
    };

    if (loading && requests.length === 0) {
        return <div className="p-4 text-center text-gray-500 font-medium">Cargando solicitudes...</div>;
    }

    return (
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Últimas Solicitudes CFDI</h3>
                    <p className="text-xs text-gray-400 font-medium mt-1">Sincronización automática con el SAT</p>
                </div>
                <button
                    onClick={onViewHistory}
                    className="group px-4 py-2 bg-emerald-50 text-[#10B981] text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#10B981] hover:text-white transition-all flex items-center gap-2"
                >
                    Ver historial completo
                    <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Tipo</th>
                            <th className="px-4 py-3">Periodo</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Progreso</th>
                            <th className="px-4 py-3">Actualización</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {requests.map((req) => (
                            <tr key={req.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{req.business_name}</div>
                                    <div className="text-xs text-gray-500 font-mono">{req.rfc}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getTypeColor(req.type)}`}>
                                        {getTypeLabel(req.type)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                    {formatDate(req.start_date)} — {formatDate(req.end_date)}
                                </td>
                                <td className="px-4 py-3">
                                    <div className={`flex items-center gap-2 px-2 py-1 rounded-full w-fit ${getStatusColor(req.state)}`}>
                                        <div className={`w-2 h-2 rounded-full bg-current animate-pulse`} />
                                        <span className="font-medium text-xs">{getStatusLabel(req.state)}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="w-24 bg-gray-200 rounded-full h-1.5 mb-1">
                                        <div
                                            className={`h-1.5 rounded-full ${req.state === 'completed' ? 'bg-green-500' : 'bg-orange-500'}`}
                                            style={{ width: req.state === 'completed' ? '100%' : '50%' }}
                                        ></div>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {req.state === 'completed' ? 'Listo' : (req.package_count > 0 ? `${req.package_count} paquetes` : 'Esperando...')}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {formatTimeAgo(req.updated_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button className="text-gray-400 hover:text-gray-600 p-1">
                                        👁️
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {requests.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                    No hay solicitudes recientes.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
