import { useEffect, useState } from 'react';
import { getRecentRequests, deleteSatRequest, getRunnerStatus, verifySatRequest } from '../services';
import type { SatRequest } from '../models';
import { RequestDetailsModal } from './RequestDetailsModal';

export function RecentRequests({ onViewHistory }: { onViewHistory: () => void }) {
    const [requests, setRequests] = useState<SatRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [runnerStatus, setRunnerStatus] = useState<{ is_alive: boolean, last_activity: string | null } | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<SatRequest | null>(null);

    const fetchRequests = async () => {
        try {
            const data = await getRecentRequests();
            // Show only last 4
            setRequests(data.slice(0, 4));
            const rStatus = await getRunnerStatus();
            setRunnerStatus(rStatus);
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

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Estás seguro de eliminar esta solicitud?')) return;

        try {
            await deleteSatRequest(id);
            await fetchRequests();
        } catch (error) {
            console.error('Error deleting request', error);
            alert('Error al eliminar la solicitud');
        }
    };

    const handleVerify = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            setProcessingId(id);
            await verifySatRequest(id);
            await fetchRequests();
        } catch (error: any) {
            alert(error.message || 'Error al verificar solicitud');
        } finally {
            setProcessingId(null);
        }
    };

    if (loading && requests.length === 0) {
        return <div className="p-4 text-center text-gray-500 font-medium">Cargando solicitudes...</div>;
    }

    return (
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-white">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        Últimas Solicitudes CFDI
                        {runnerStatus && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest font-bold ${runnerStatus.is_alive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${runnerStatus.is_alive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                {runnerStatus.is_alive ? 'Runner Activo' : 'Runner Detenido'}
                            </div>
                        )}
                    </h3>
                    <p className="text-xs text-gray-400 font-medium mt-1">
                        Sincronización automática con el SAT
                        {runnerStatus?.last_activity && (
                            <span className="ml-2 text-gray-400">— Última actividad: {new Date(runnerStatus.last_activity).toLocaleTimeString()}</span>
                        )}
                    </p>
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
                                    <div className="w-24 bg-gray-100 rounded-full h-1.5 mb-1 overflow-hidden">
                                        <div
                                            className={`h-1.5 rounded-full transition-all duration-1000 ${req.state === 'completed' ? 'bg-emerald-500 w-full' :
                                                req.state === 'failed' ? 'bg-red-500 w-full' :
                                                    req.state === 'downloading' || req.state === 'extracting' ? 'bg-orange-500 w-[75%]' :
                                                        req.state === 'polling' ? 'bg-yellow-500 w-[30%]' : 'bg-gray-300 w-[10%]'
                                                } ${(req.state !== 'completed' && req.state !== 'failed') ? 'animate-pulse' : ''}`}
                                        ></div>
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                        {req.state === 'completed' ? 'Finalizado' :
                                            req.state === 'extracting' ? 'Extrayendo...' :
                                                req.state === 'downloading' ? 'Descargando...' :
                                                    req.state === 'polling' ? 'SAT Procesando...' : 'En cola'}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {formatTimeAgo(req.updated_at)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                        {req.state !== 'completed' && req.state !== 'error' && req.state !== 'failed' && req.state !== 'canceled' && (
                                            <button
                                                onClick={(e) => handleVerify(req.id, e)}
                                                disabled={processingId === req.id}
                                                className="text-emerald-500 hover:text-emerald-700 p-1 transition-colors disabled:opacity-50"
                                                title="Procesar Manualmente"
                                            >
                                                {processingId === req.id ? (
                                                    <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedRequest(req)}
                                            className="text-[#10B981] hover:bg-emerald-50 p-2 rounded-xl transition-all"
                                            title="Ver detalles"
                                        >
                                            <span className="material-symbols-outlined text-sm font-black">visibility</span>
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(req.id, e)}
                                            className="text-red-300 hover:text-red-600 p-1 transition-colors"
                                            title="Eliminar solicitud"
                                        >
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
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

            {selectedRequest && (
                <RequestDetailsModal
                    request={selectedRequest}
                    isOpen={!!selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                />
            )}
        </div>
    );
}
