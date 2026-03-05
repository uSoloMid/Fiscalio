import { useEffect, useState } from 'react';
import { listSatRequests, verifySatRequest, getRunnerStatus, bulkDeleteSatRequests, listClients, createManualRequest, fillSatGaps, getSatCoverage } from '../services';

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
    xml_count: number;
    attempts: number;
    last_error: string | null;
}

interface Client {
    rfc: string;
    legal_name?: string;
    common_name?: string;
}

const EMPTY_MANUAL = { rfc: '', start_date: '', end_date: '', type: 'all' };

function CoveragePct({ pct, gaps }: { pct: number; gaps: number }) {
    const color = pct >= 99 ? 'text-green-600 bg-green-50' : pct >= 80 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
            {pct >= 99
                ? <span className="material-symbols-outlined text-[14px]">check_circle</span>
                : <span className="material-symbols-outlined text-[14px]">warning</span>}
            {pct.toFixed(0)}%
            {gaps > 0 && <span className="opacity-70">({gaps} {gaps === 1 ? 'hueco' : 'huecos'})</span>}
        </span>
    );
}

export function SatRequestsHistoryPage({ onBack }: { onBack: () => void }) {
    const [requests, setRequests] = useState<SatRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [runnerStatus, setRunnerStatus] = useState<{ is_alive: boolean, last_activity: string | null } | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [rfcFilter, setRfcFilter] = useState('');
    const [expandedError, setExpandedError] = useState<string | null>(null);

    // Manual Request Modal State
    const [showModal, setShowModal] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [manualRequest, setManualRequest] = useState(EMPTY_MANUAL);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Coverage State
    const [showCoverage, setShowCoverage] = useState(false);
    const [coverage, setCoverage] = useState<any[]>([]);
    const [loadingCoverage, setLoadingCoverage] = useState(false);
    const [fillingGaps, setFillingGaps] = useState(false);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await listSatRequests({ page, rfc: rfcFilter || undefined });
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
        setManualRequest(EMPTY_MANUAL);
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
            setShowModal(false);
            setManualRequest(EMPTY_MANUAL);
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
            await verifySatRequest(id);
            await fetchRequests();
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

    const handleToggleCoverage = async () => {
        if (showCoverage) { setShowCoverage(false); return; }
        setShowCoverage(true);
        setLoadingCoverage(true);
        try {
            const data = await getSatCoverage();
            setCoverage(data);
        } catch (e) {
            console.error('Error loading coverage', e);
        } finally {
            setLoadingCoverage(false);
        }
    };

    const handleFillGaps = async (rfc?: string) => {
        setFillingGaps(true);
        try {
            const res = await fillSatGaps(rfc);
            const msg = rfc
                ? `Se crearon ${res.requests_created} solicitudes para ${rfc}`
                : `Se crearon ${res.requests_created} solicitudes para ${res.clients_processed} clientes`;
            alert(msg);
            // Refrescar cobertura y solicitudes
            const [data] = await Promise.all([getSatCoverage(), fetchRequests()]);
            setCoverage(data);
        } catch (e: any) {
            alert(e.message || 'Error al rellenar huecos');
        } finally {
            setFillingGaps(false);
        }
    };

    useEffect(() => {
        fetchRequests();
        const interval = setInterval(fetchRequests, 10000);
        return () => clearInterval(interval);
    }, [page, rfcFilter]);

    const isTerminal = (state: string) =>
        ['completed', 'failed', 'error', 'canceled'].includes(state);

    const getStatusColor = (state: string) => {
        switch (state) {
            case 'completed':   return 'text-green-600 bg-green-50';
            case 'downloading': return 'text-orange-600 bg-orange-50';
            case 'failed':      return 'text-red-600 bg-red-50';
            case 'error':       return 'text-red-600 bg-red-50';
            case 'canceled':    return 'text-gray-500 bg-gray-100';
            default:            return 'text-yellow-600 bg-yellow-50';
        }
    };

    const getStatusLabel = (state: string) => {
        switch (state) {
            case 'completed':   return 'Completada';
            case 'downloading': return 'Descargando';
            case 'failed':      return 'Fallida';
            case 'error':       return 'Error';
            case 'created':     return 'En cola';
            case 'polling':     return 'Verificando';
            case 'canceled':    return 'Cancelada';
            default:            return state;
        }
    };

    const getTypeLabel = (type: string) => type === 'issued' ? 'EMITIDAS' : 'RECIBIDAS';

    const getTypeColor = (type: string) =>
        type === 'issued'
            ? 'text-blue-600 bg-blue-50 border-blue-200'
            : 'text-purple-600 bg-purple-50 border-purple-200';

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-MX');
    };

    const formatDateTime = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
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
                                    <span className="ml-2 text-gray-400">— Última actividad: {new Date(runnerStatus.last_activity).toLocaleTimeString('es-MX')}</span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            placeholder="Filtrar RFC..."
                            value={rfcFilter}
                            onChange={e => { setRfcFilter(e.target.value.toUpperCase()); setPage(1); }}
                            className="hidden md:block px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 w-44"
                        />
                        <button
                            onClick={handleToggleCoverage}
                            className={`flex items-center gap-2 px-4 py-2 border text-xs font-black rounded-xl transition-all uppercase tracking-wider ${showCoverage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200'}`}
                        >
                            <span className="material-symbols-outlined text-sm">verified</span>
                            Cobertura
                        </button>
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
                            Limpiar
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 md:p-10 overflow-y-auto space-y-6">

                {/* Panel de Cobertura */}
                {showCoverage && (
                    <div className="bg-white rounded-[32px] border border-indigo-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">Cobertura por Cliente</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Últimos 5 años. Un hueco = periodo sin solicitud completada.</p>
                            </div>
                            <button
                                onClick={() => handleFillGaps()}
                                disabled={fillingGaps}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-50 uppercase tracking-wider"
                            >
                                {fillingGaps
                                    ? <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                    : <span className="material-symbols-outlined text-sm">auto_fix_high</span>}
                                Rellenar todos los huecos
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            {loadingCoverage ? (
                                <div className="flex justify-center items-center py-12 text-gray-400 text-sm">
                                    <span className="material-symbols-outlined animate-spin mr-2">refresh</span>
                                    Calculando cobertura...
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                                        <tr>
                                            <th className="px-6 py-4">Cliente</th>
                                            <th className="px-6 py-4 text-center">Emitidas</th>
                                            <th className="px-6 py-4 text-center">Recibidas</th>
                                            <th className="px-6 py-4 text-center">Último cubierto</th>
                                            <th className="px-6 py-4"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {coverage.map((c) => {
                                            const hasGaps = (c.coverage?.issued?.gaps_count ?? 0) > 0 || (c.coverage?.received?.gaps_count ?? 0) > 0;
                                            const lastCovered = c.coverage?.issued?.last_covered || c.coverage?.received?.last_covered;
                                            return (
                                                <tr key={c.rfc} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-4">
                                                        <div className="font-semibold text-gray-900 text-sm">{c.legal_name}</div>
                                                        <div className="text-xs font-mono text-gray-400">{c.rfc}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <CoveragePct pct={c.coverage?.issued?.covered_pct ?? 0} gaps={c.coverage?.issued?.gaps_count ?? 0} />
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <CoveragePct pct={c.coverage?.received?.covered_pct ?? 0} gaps={c.coverage?.received?.gaps_count ?? 0} />
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-xs text-gray-500">
                                                        {lastCovered ? new Date(lastCovered).toLocaleDateString('es-MX') : '—'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {hasGaps && (
                                                            <button
                                                                onClick={() => handleFillGaps(c.rfc)}
                                                                disabled={fillingGaps}
                                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold disabled:opacity-50"
                                                            >
                                                                Rellenar
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-widest border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-5">Cliente</th>
                                    <th className="px-6 py-5">Tipo</th>
                                    <th className="px-6 py-5">Periodo</th>
                                    <th className="px-6 py-5">Estado</th>
                                    <th className="px-6 py-5">XMLs / Paq.</th>
                                    <th className="px-6 py-5">Intentos</th>
                                    <th className="px-6 py-5">Creada</th>
                                    <th className="px-6 py-5 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {requests.map((req) => (
                                    <>
                                        <tr
                                            key={req.id}
                                            className={`hover:bg-gray-50/50 transition-colors ${req.last_error && isTerminal(req.state) ? 'cursor-pointer' : ''}`}
                                            onClick={() => req.last_error && isTerminal(req.state) && setExpandedError(expandedError === req.id ? null : req.id)}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 text-sm">{req.business_name}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">{req.rfc}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider ${getTypeColor(req.type)}`}>
                                                    {getTypeLabel(req.type)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 font-medium whitespace-nowrap text-xs">
                                                {formatDate(req.start_date)} — {formatDate(req.end_date)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full w-fit ${getStatusColor(req.state)}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full bg-current ${!isTerminal(req.state) ? 'animate-pulse' : ''}`} />
                                                    <span className="font-bold text-[10px] uppercase tracking-wider">{getStatusLabel(req.state)}</span>
                                                </div>
                                                {req.last_error && isTerminal(req.state) && (
                                                    <div className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[10px]">{expandedError === req.id ? 'expand_less' : 'expand_more'}</span>
                                                        {expandedError === req.id ? 'Ocultar error' : 'Ver error'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-700">{req.xml_count ?? 0}</div>
                                                <div className="text-[10px] text-gray-400">{req.package_count ?? 0} paquetes</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`font-bold text-sm ${(req.attempts ?? 0) >= 4 ? 'text-red-500' : 'text-gray-700'}`}>
                                                    {req.attempts ?? 0} / 5
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 text-xs whitespace-nowrap">
                                                {formatDateTime(req.created_at)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!isTerminal(req.state) && (
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
                                        {expandedError === req.id && req.last_error && (
                                            <tr key={`${req.id}-error`} className="bg-red-50/60">
                                                <td colSpan={8} className="px-8 py-3">
                                                    <div className="flex items-start gap-2 text-red-600">
                                                        <span className="material-symbols-outlined text-sm mt-0.5 flex-shrink-0">error</span>
                                                        <p className="text-xs font-mono break-all">{req.last_error}</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                                {requests.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={8} className="px-8 py-20 text-center">
                                            <span className="material-symbols-outlined text-gray-200 text-6xl mb-4">history</span>
                                            <p className="text-gray-400 font-medium">No se han encontrado solicitudes en el historial.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

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

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Solicitud Manual SAT</h3>
                                <p className="text-xs text-gray-500 font-medium">Define el RFC y el rango de fechas</p>
                            </div>
                            <button
                                onClick={() => { setShowModal(false); setManualRequest(EMPTY_MANUAL); }}
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
