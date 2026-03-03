import { useEffect, useState } from 'react';
import { listSatRequests, verifySatRequest, getRunnerStatus, bulkDeleteSatRequests, listClients, createManualRequest } from '../services';

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

interface Client {
    rfc: string;
    legal_name?: string;
    common_name?: string;
}

export function SatRequestsHistoryPage({ onBack }: { onBack: () => void }) {
    const [requests, setRequests] = useState<SatRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [runnerStatus, setRunnerStatus] = useState<{ is_alive: boolean, last_activity: string | null } | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Manual Request Modal State
    const [showModal, setShowModal] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [manualRequest, setManualRequest] = useState({
        rfc: '',
        start_date: '',
        end_date: '',
        type: 'all'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await listSatRequests({ page });
            setRequests(data.data || []);
            setTotalPages(data.last_page);

            const rStatus = await getRunnerStatus();
            setRunnerStatus(rStatus);
        } catch (error) {
            console.error('Error loading requests', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = async () => {
        setShowModal(true);
        try {
            const data = await listClients();
            setClients(data);
        } catch (e) {
            console.error('Error loading clients', e);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualRequest.rfc || !manualRequest.start_date || !manualRequest.end_date) {
            alert('Por favor completa todos los campos');
            return;
        }

        try {
            setIsSubmitting(true);
            await createManualRequest(manualRequest.rfc, manualRequest.start_date, manualRequest.end_date, manualRequest.type);
            alert('Solicitud creada correctamente. Aparecerá en el historial en unos momentos.');
            setShowModal(false);
            await fetchRequests();
        } catch (error: any) {
            alert(error.message || 'Error al crear solicitud manual');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerify = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            setProcessingId(id);
            const res = await verifySatRequest(id);
            await fetchRequests();
            alert(res.message || 'Consulta completada');
        } catch (error: any) {
            alert(error.message || 'Error al verificar solicitud');
        } finally {
            setProcessingId(null);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm('¿Estás seguro de que deseas eliminar todas las solicitudes completadas y fallidas?')) return;

        try {
            setIsDeleting(true);
            const res = await bulkDeleteSatRequests();
            alert(res.message || 'Historial limpiado');
            await fetchRequests();
        } catch (error: any) {
            alert(error.message || 'Error al limpiar historial');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        fetchRequests();
        const interval = setInterval(fetchRequests, 10000); // Poll every 10s
        return () => clearInterval(interval);
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
            <header className="bg-white border-b border-gray-100 flex-shrink-0 py-2 md:py-0">
                <div className="h-auto md:h-20 flex items-center justify-between px-4 md:px-10">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-base md:text-xl font-bold text-gray-900 truncate flex items-center gap-3">
                                Historial Solicitudes SAT
                                {runnerStatus && (
                                    <div className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-widest font-bold ${runnerStatus.is_alive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${runnerStatus.is_alive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                        {runnerStatus.is_alive ? 'Activo' : 'Detenido'}
                                    </div>
                                )}
                            </h1>
                            <p className="text-[10px] md:text-xs text-gray-500 font-medium truncate">
                                Registro completo de descargas
                                {runnerStatus?.last_activity && (
                                    <span className="ml-2 text-gray-400">— Última actividad: {new Date(runnerStatus.last_activity).toLocaleTimeString()}</span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleOpenModal}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 text-xs font-black rounded-xl transition-all uppercase tracking-wider"
                        >
                            <span className="material-symbols-outlined text-sm">add_circle</span>
                            Solicitud Manual
                        </button>

                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeleting || requests.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-black rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
                        >
                            {isDeleting ? (
                                <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                            ) : (
                                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                            )}
                            Limpiar Historial
                        </button>
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
                                    <th className="px-8 py-5 text-right">Acciones</th>
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
                                                <div className={`w-1.5 h-1.5 rounded-full bg-current ${req.state !== 'completed' && req.state !== 'error' && req.state !== 'failed' && req.state !== 'canceled' ? 'animate-pulse' : ''}`} />
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
                                        <td className="px-8 py-5 text-right">
                                            {req.state !== 'completed' && req.state !== 'error' && req.state !== 'failed' && req.state !== 'canceled' && (
                                                <button
                                                    onClick={(e) => handleVerify(req.id, e)}
                                                    disabled={processingId === req.id}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Verificar y procesar manualmente"
                                                >
                                                    {processingId === req.id ? (
                                                        <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                                    ) : (
                                                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                                                    )}
                                                    Procesar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {requests.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={7} className="px-8 py-20 text-center">
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

            {/* Manual Request Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Solicitud Manual SAT</h3>
                                <p className="text-xs text-gray-500 font-medium">Define el RFC y el rango de fechas</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-gray-600 transition-all border border-transparent hover:border-gray-100"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleManualSubmit} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">Cliente / RFC</label>
                                <select
                                    className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500 transition-all appearance-none cursor-pointer"
                                    value={manualRequest.rfc}
                                    onChange={e => setManualRequest({ ...manualRequest, rfc: e.target.value })}
                                    required
                                >
                                    <option value="">Selecciona un cliente...</option>
                                    {clients.map(c => (
                                        <option key={c.rfc} value={c.rfc}>{c.common_name || c.legal_name || c.rfc} ({c.rfc})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500 transition-all"
                                        value={manualRequest.start_date}
                                        onChange={e => setManualRequest({ ...manualRequest, start_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">Fecha Fin</label>
                                    <input
                                        type="date"
                                        className="w-full bg-gray-50 border-0 rounded-2xl p-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500 transition-all"
                                        value={manualRequest.end_date}
                                        onChange={e => setManualRequest({ ...manualRequest, end_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">Tipo de Facturas</label>
                                <div className="flex gap-2 p-1 bg-gray-50 rounded-2xl">
                                    {['all', 'issued', 'received'].map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setManualRequest({ ...manualRequest, type: t })}
                                            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${manualRequest.type === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {t === 'all' ? 'Ambas' : t === 'issued' ? 'Emitidas' : 'Recibidas'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 group shadow-lg shadow-gray-200"
                            >
                                {isSubmitting ? (
                                    <span className="material-symbols-outlined animate-spin">refresh</span>
                                ) : (
                                    <>
                                        <span>Crear Solicitud</span>
                                        <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
