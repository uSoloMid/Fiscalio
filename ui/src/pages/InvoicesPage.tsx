
import React, { useState, useEffect } from 'react';
import { listCfdis, getCfdi, refreshCfdiStatus, getPeriods, startSync, verifyStatus, getActiveRequests } from '../services';
import type { Cfdi } from '../models';

export const InvoicesPage = ({ activeRfc, onBack, clientName }: { activeRfc: string, onBack?: () => void, clientName?: string }) => {
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [filterType, setFilterType] = useState<'all' | 'emitidas' | 'recibidas'>('all');
    const [search, setSearch] = useState('');
    const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);

    const [activeClientName, setActiveClientName] = useState('');
    const [data, setData] = useState<Cfdi[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [selectedCfdi, setSelectedCfdi] = useState<Cfdi | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [satStatusUpdating, setSatStatusUpdating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [verificationSummary, setVerificationSummary] = useState<any>(null);
    const [activeRequests, setActiveRequests] = useState<any[]>([]);



    useEffect(() => {
        if (data.length > 0) {
            // Find a CFDI where this user is involved to extract their name
            const match = data.find(c => c.rfc_emisor === activeRfc || c.rfc_receptor === activeRfc);
            if (match) {
                if (match.rfc_emisor === activeRfc && match.name_emisor) setActiveClientName(match.name_emisor);
                else if (match.rfc_receptor === activeRfc && match.name_receptor) setActiveClientName(match.name_receptor);
            }
        }
    }, [data, activeRfc]);


    // Auto-select latest date when RFC changes AND load periods
    useEffect(() => {
        if (!activeRfc) return;

        const loadPeriods = async () => {
            try {
                // 1. Get available periods
                const periods = await getPeriods(activeRfc);
                setAvailablePeriods(periods);

                // 2. Auto-select first period (latest) if available
                if (periods.length > 0) {
                    const latest = periods[0]; // '2025-01'
                    const y = latest.substring(0, 4);
                    const m = latest.substring(5, 7);
                    setYear(y);
                    setMonth(m);
                }
            } catch (e) {
                console.error("Failed to load periods", e);
            }
        };

        loadPeriods();
    }, [activeRfc]);

    useEffect(() => {
        if (!activeRfc) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRfc, year, month, filterType, search]);

    useEffect(() => {
        if (selectedUuid) {
            loadCfdiDetail(selectedUuid);
        } else {
            setSelectedCfdi(null);
        }
    }, [selectedUuid]);


    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await listCfdis({
                rfc_user: activeRfc,
                year,
                month,
                tipo: filterType === 'all' ? undefined : filterType,
                q: search,
                page: 1,
                pageSize: 50
            });
            if (res && Array.isArray(res.data)) {
                setData(res.data);
            } else {
                setData([]);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const loadCfdiDetail = async (uuid: string) => {
        setDrawerLoading(true);
        try {
            const res = await getCfdi(uuid);
            setSelectedCfdi(res.metadata);
        } catch (error) {
            console.error(error);
        } finally {
            setDrawerLoading(false);
        }
    };

    const handleRefreshStatus = async () => {
        if (!selectedUuid) return;
        setSatStatusUpdating(true);
        try {
            const res = await refreshCfdiStatus(selectedUuid);
            setSelectedCfdi(res.metadata);
            fetchData();
        } catch (error) {
            console.error(error);
        } finally {
            setSatStatusUpdating(false);
        }
    };

    // Poll active requests
    useEffect(() => {
        if (!activeRfc) return;

        const fetchActiveRequests = async () => {
            try {
                const reqs = await getActiveRequests(activeRfc);
                setActiveRequests(reqs);

                // If any is polling/downloading, check if we got new data
                const anyInProgress = reqs.some((r: any) => ['created', 'polling', 'downloading'].includes(r.state));
                if (anyInProgress) {
                    // Maybe refresh data if something finished? 
                    // For now just keep polling
                }
            } catch (e) {
                console.error("Failed to fetch active requests", e);
            }
        };

        fetchActiveRequests();
        const interval = setInterval(fetchActiveRequests, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [activeRfc]);

    // Auto-sync on load
    useEffect(() => {
        if (activeRfc) {
            handleAutoSync(false); // background sync
        }
    }, [activeRfc]);

    const handleAutoSync = async (manual = false) => {
        setSyncing(true);
        try {
            const res = await startSync(activeRfc);
            if (res.last_sync) {
                setLastSyncAt(res.last_sync);
            }
            if (manual) {
                // Refresh list
                const reqs = await getActiveRequests(activeRfc);
                setActiveRequests(reqs);
            }
        } catch (e) {
            console.error("Auto-sync failed", e);
        } finally {
            setSyncing(false);
        }
    };

    const handleVerifyBatch = async () => {
        setVerifying(true);
        try {
            const res = await verifyStatus(activeRfc);
            setVerificationSummary(res);
            fetchData();
        } catch (e) {
            console.error("Verification failed", e);
        } finally {
            setVerifying(false);
        }
    };

    const handleRfcChange = () => {
        if (onBack) onBack();
    };

    const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val) {
            setYear(val.substring(0, 4));
            setMonth(val.substring(5, 7));
        }
    };

    if (!activeRfc) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="flex items-center gap-6 justify-center mb-4">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="bg-white border border-gray-200 p-2 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center text-gray-400 hover:text-gray-600"
                                title="Volver al Dashboard"
                            >
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                        )}
                        <h1 className="text-2xl font-bold text-gray-900">Selecciona un cliente</h1>
                    </div>
                    <p className="text-gray-500 mb-4">Para comenzar, selecciona un cliente del dashboard.</p>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                            Volver al Dashboard
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="text-gray-800 min-h-screen flex overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 z-20">
                <div className="h-20 flex items-center px-6 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-[var(--primary)] font-bold text-xl tracking-tight">
                        <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                        <span>Contalink</span>
                    </div>
                </div>
                <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto">
                    <a className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 text-sm" href="#">
                        <span className="material-symbols-outlined text-xl">dashboard</span>
                        Dashboard
                    </a>
                    <a className="nav-item active flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm" href="#">
                        <span className="material-symbols-outlined text-xl">receipt_long</span>
                        Facturas
                    </a>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--background-light)] relative">
                <header className="bg-white border-b border-gray-200 z-10 flex-shrink-0 h-20 px-8 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onBack || handleRfcChange}
                            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium group"
                        >
                            <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                            {onBack ? 'Volver al Dashboard' : 'Cambiar cliente'}
                        </button>
                        <div className="w-px h-10 bg-gray-200"></div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{clientName || activeClientName || activeRfc}</h1>
                            <p className="text-xs font-mono text-gray-500 tracking-wide mt-0.5">{activeRfc}</p>
                        </div>
                    </div>
                    {/* Header Filters */}
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">calendar_month</span>
                            <select
                                className="appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-shadow cursor-pointer min-w-[140px]"
                                value={`${year}-${month}`}
                                onChange={handlePeriodChange}
                            >
                                {availablePeriods.length === 0 && (
                                    <option value={`${year}-${month}`}>{year}-{month}</option>
                                )}
                                {availablePeriods.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm">expand_more</span>
                        </div>
                    </div>
                </header>

                <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-col gap-3 sticky top-0 z-30 shadow-sm">
                    {/* Active Requests Banner */}
                    {activeRequests.some(r => ['created', 'polling', 'downloading', 'extracting'].includes(r.state) || (r.state === 'failed' && new Date(r.updated_at) > new Date(Date.now() - 300000))) && (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 flex flex-col gap-2 mb-1 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 rounded-xl">
                                        <span className={`material-symbols-outlined text-emerald-600 ${activeRequests.some(r => ['created', 'polling', 'downloading'].includes(r.state)) ? 'animate-spin' : ''}`}>
                                            {activeRequests.some(r => r.state === 'failed') ? 'warning' : 'sync'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-emerald-900">
                                            {activeRequests.some(r => r.state === 'downloading') ? 'Descargando archivos...' :
                                                activeRequests.some(r => r.state === 'polling') ? 'Esperando respuesta del SAT...' :
                                                    activeRequests.every(r => r.state === 'created') ? 'Solicitudes en cola de espera' :
                                                        activeRequests.some(r => r.state === 'failed') ? 'Atención: Algunos errores detectados' : 'Procesando paquetes...'}
                                        </span>
                                        <span className="text-[10px] text-emerald-600 font-medium leading-tight">
                                            {activeRequests.every(r => r.state === 'created') ?
                                                'Hay otras solicitudes procesándose antes que estas. El sistema las tomará en unos momentos.' :
                                                'El SAT está preparando tus archivos. Esto puede tardar de 1 a 5 minutos.'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => fetchData()}
                                        className="px-3 py-1 bg-white border border-emerald-100 text-emerald-600 text-[10px] font-bold rounded-lg hover:bg-emerald-50 transition-colors"
                                    >
                                        Refrescar Tabla
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-1">
                                {activeRequests.filter(r => ['created', 'polling', 'downloading', 'failed'].includes(r.state)).map(r => (
                                    <div key={r.id} className={`flex items-center gap-2 px-2 py-1 bg-white rounded-lg border text-[9px] font-bold shadow-sm ${r.state === 'failed' ? 'border-red-100 text-red-500' : 'border-emerald-50 text-emerald-500'}`} title={r.last_error || ''}>
                                        <span className="uppercase">{r.type === 'issued' ? 'Emit' : 'Recib'}: {new Date(r.start_date).toLocaleDateString([], { month: 'short' })}</span>
                                        <span className="w-1 h-1 rounded-full bg-current opacity-30"></span>
                                        <span>
                                            {r.state === 'created' ? 'En cola' :
                                                r.state === 'polling' ? 'SAT procesando' :
                                                    r.state === 'downloading' ? 'Descargando' :
                                                        r.state === 'failed' ? 'Error' : r.state}
                                        </span>
                                        {r.attempts > 0 && <span className="opacity-60">({r.attempts})</span>}
                                    </div>
                                ))}
                            </div>

                            {activeRequests.some(r => r.state === 'failed' && r.last_error) && (
                                <div className="mt-1 p-2 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2">
                                    <span className="material-symbols-outlined text-red-500 text-xs mt-0.5">error</span>
                                    <p className="text-[9px] text-red-700 leading-tight">
                                        <b>Último error:</b> {activeRequests.find(r => r.state === 'failed' && r.last_error)?.last_error}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500 border-b border-gray-100 pb-2 mb-1">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">sync</span>
                            Conectado a API Local
                        </span>
                    </div>
                    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                        <div className="relative min-w-[240px]">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                            <input
                                className="w-full pl-9 pr-3 py-1.5 text-sm border-gray-300 rounded-md focus:border-[var(--primary)] focus:ring-[var(--primary)] shadow-sm"
                                placeholder="Buscar UUID, RFC, concepto..."
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="h-6 w-px bg-gray-200 mx-2 flex-shrink-0"></div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${filterType === 'all' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}
                            >
                                Todas
                            </button>
                            <button
                                onClick={() => setFilterType('emitidas')}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${filterType === 'emitidas' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}
                            >
                                Emitidas
                            </button>
                            <button
                                onClick={() => setFilterType('recibidas')}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${filterType === 'recibidas' ? 'bg-gray-900 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}
                            >
                                Recibidas
                            </button>
                        </div>

                        <div className="flex-1"></div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleAutoSync(true)}
                                disabled={syncing}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm ${syncing ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                <span className={`material-symbols-outlined text-sm ${syncing ? 'animate-spin' : ''}`}>sync</span>
                                {syncing ? 'Sincronizando...' : (lastSyncAt ? `Última: ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sincronizar')}
                            </button>

                            <button
                                onClick={handleVerifyBatch}
                                disabled={verifying}
                                className="flex items-center gap-2 px-4 py-2 bg-[#135bec] text-white text-xs font-bold rounded-xl hover:bg-[#0d47b7] disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
                            >
                                <span className={`material-symbols-outlined text-sm ${verifying ? 'animate-spin' : ''}`}>fact_check</span>
                                {verifying ? 'Verificando...' : 'Verificar Estatus'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 overflow-auto bg-white">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-20">
                                <tr>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                        <span className="material-symbols-outlined text-base" title="Estado">info</span>
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Fecha</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">RFC / Nombre</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">Concepto</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Total</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">IVA</th>
                                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Ret</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Tipo</th>
                                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Estatus SAT</th>
                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">UUID</th>
                                    <th className="w-8 px-1"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading && (
                                    <tr>
                                        <td colSpan={11} className="text-center py-4 text-gray-500">Cargando facturas...</td>
                                    </tr>
                                )}
                                {!loading && data.length === 0 && (
                                    <tr>
                                        <td colSpan={11} className="text-center py-8 text-gray-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <span className="material-symbols-outlined text-4xl">inbox</span>
                                                <p>No se encontraron facturas para {activeRfc} en {month}/{year}</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {data.map(cfdi => (
                                    <tr
                                        key={cfdi.uuid}
                                        onClick={() => setSelectedUuid(cfdi.uuid)}
                                        className={`table-row-hover hover:bg-gray-50 cursor-pointer transition-colors ${selectedUuid === cfdi.uuid ? 'bg-emerald-50' : ''}`}
                                    >
                                        <td className="px-3 py-3 whitespace-nowrap text-center">
                                            {cfdi.es_cancelado ? (
                                                <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-900">
                                            {cfdi.fecha ? cfdi.fecha.substring(0, 10) : '-'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-900 font-medium">
                                            {(() => {
                                                const isEmitted = cfdi.rfc_emisor === activeRfc;
                                                const otherName = isEmitted ? cfdi.name_receptor : cfdi.name_emisor;
                                                const otherRfc = isEmitted ? cfdi.rfc_receptor : cfdi.rfc_emisor;
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold truncate max-w-[150px]" title={otherName || ''}>{otherName || otherRfc}</span>
                                                        {otherName && <span className="text-gray-500 font-normal text-[10px]">{otherRfc}</span>}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-3 text-xs text-gray-600 truncate max-w-[200px]" title={cfdi.concepto || ''}>
                                            {cfdi.concepto || '-'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-right font-medium text-gray-900">
                                            ${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.total)}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-right text-gray-600">
                                            {cfdi.iva ? `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.iva)}` : '-'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-right text-gray-600">
                                            {cfdi.retenciones && Number(cfdi.retenciones) > 0 ? `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.retenciones)}` : '-'}
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-center">
                                            <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-medium">{cfdi.tipo}</span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${cfdi.estado_sat === 'Vigente' ? 'bg-emerald-100 text-emerald-700' :
                                                cfdi.estado_sat === 'Cancelado' ? 'bg-red-100 text-red-700' :
                                                    cfdi.estado_sat === 'No Encontrado' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-gray-100 text-gray-600'
                                                }`}>
                                                {cfdi.estado_sat || 'Sin verificar'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                                            {cfdi.uuid}
                                        </td>
                                        <td className="px-1 py-3 whitespace-nowrap text-right">
                                            <span className="material-symbols-outlined text-lg text-gray-400">chevron_right</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Drawer */}
                    {selectedUuid && (
                        <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col shadow-xl z-20">
                            <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100">
                                <h3 className="font-semibold text-gray-800">Detalle de Factura</h3>
                                <button onClick={() => setSelectedUuid(null)} className="text-gray-400 hover:text-gray-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                {drawerLoading && <p>Cargando detalle...</p>}
                                {!drawerLoading && selectedCfdi && (
                                    <>
                                        <div className="flex gap-4">
                                            <div className="w-20 h-24 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center relative group">
                                                <span className="material-symbols-outlined text-gray-400 text-3xl">description</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-900 truncate">{selectedCfdi.rfc_emisor}</h4>
                                                <p className="text-xs text-gray-500 font-mono mt-1 break-all">{selectedCfdi.uuid}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${selectedCfdi.estado_sat === 'Vigente' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                        {selectedCfdi.estado_sat || 'Estado desconocido'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                                <p className="text-gray-500">Receptor</p>
                                                <p className="font-medium text-gray-900">{selectedCfdi.rfc_receptor}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Fecha</p>
                                                <p className="font-medium text-gray-900">{selectedCfdi.fecha}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500">Tipo</p>
                                                <p className="font-medium text-gray-900">{selectedCfdi.tipo}</p>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-100 pt-4">
                                            <div className="flex justify-between items-center text-base pt-2 border-t border-dashed border-gray-200">
                                                <span className="font-bold text-gray-900">Total</span>
                                                <span className="font-bold text-gray-900">${selectedCfdi.total}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-4">
                                            <button
                                                onClick={handleRefreshStatus}
                                                disabled={satStatusUpdating}
                                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span className={`material-symbols-outlined text-lg ${satStatusUpdating ? 'animate-spin' : ''}`}>sync</span>
                                                {satStatusUpdating ? 'Actualizando...' : 'Actualizar Estatus SAT'}
                                            </button>

                                            <a
                                                href={`/api/cfdis/${selectedCfdi.uuid}/xml`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="w-full py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">download</span>
                                                Descargar XML
                                            </a>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Verification Summary Modal */}
                {verificationSummary && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setVerificationSummary(null)}></div>
                        <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-50 rounded-2xl">
                                        <span className="material-symbols-outlined text-blue-600">fact_check</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">Resultado de Verificación</h3>
                                        <p className="text-xs text-gray-500 font-medium">{verificationSummary.verified_now} facturas procesadas de {verificationSummary.total_pending} pendientes.</p>
                                    </div>
                                </div>
                                <button onClick={() => setVerificationSummary(null)} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-50 flex items-center justify-center">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 no-scrollbar space-y-4">
                                {verificationSummary.changes.length === 0 ? (
                                    <div className="py-12 bg-gray-50 rounded-3xl border border-gray-100 flex flex-col items-center justify-center text-center">
                                        <span className="material-symbols-outlined text-emerald-500 text-5xl mb-4">check_circle</span>
                                        <h4 className="text-sm font-bold text-gray-900">Sin Cambios Detectados</h4>
                                        <p className="text-[11px] text-gray-500 max-w-[240px] mt-2">Todas las facturas verificadas mantienen su estatus previo en el SAT.</p>
                                    </div>
                                ) : (
                                    <>
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Se detectaron {verificationSummary.changes.length} cambios:</h4>
                                        {verificationSummary.changes.map((change: any) => (
                                            <div key={change.uuid} className="p-5 bg-white border border-gray-100 rounded-3xl hover:border-gray-200 transition-all">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className="text-xs font-bold text-gray-900 truncate">{change.name || change.rfc}</h5>
                                                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{change.uuid}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-bold text-gray-900">${change.total}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-bold uppercase">{change.old_status || 'Sin estado'}</span>
                                                    <span className="material-symbols-outlined text-gray-300 text-sm">arrow_forward</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${change.new_status === 'Cancelado' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{change.new_status}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => setVerificationSummary(null)}
                                className="mt-8 w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all text-sm uppercase tracking-widest"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
