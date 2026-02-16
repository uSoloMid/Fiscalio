
import React, { useState, useEffect } from 'react';
import { listCfdis, getCfdi, refreshCfdiStatus, getPeriods, startSync, verifyStatus, getActiveRequests, exportInvoicesZip, downloadProvisionalXmlZip } from '../services';
import { AccountsPage } from './AccountsPage';
import { ProvisionalControlPage } from './ProvisionalControlPage';
import type { Cfdi } from '../models';

export const InvoicesPage = ({ activeRfc, onBack, clientName }: { activeRfc: string, onBack?: () => void, clientName?: string }) => {
    const [year, setYear] = useState(localStorage.getItem('active_year') || new Date().getFullYear().toString());
    const [month, setMonth] = useState(localStorage.getItem('active_month') || (new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [filterType, setFilterType] = useState<'all' | 'emitidas' | 'recibidas' | 'canceladas'>('all');
    const [cfdiTipo, setCfdiTipo] = useState<'I' | 'E' | 'N' | 'P' | 'T' | ''>('I');
    const [search, setSearch] = useState('');
    const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);

    const [activeClientName, setActiveClientName] = useState('');
    const [data, setData] = useState<Cfdi[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
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
    const [drawerWidth, setDrawerWidth] = useState(360);
    const [isResizing, setIsResizing] = useState(false);
    const [currentView, setCurrentView] = useState<'invoices' | 'accounts' | 'provisional'>('invoices');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [showCancelled, setShowCancelled] = useState(false);
    const [showDownloadXmlModal, setShowDownloadXmlModal] = useState(false);
    const [downloadTypes, setDownloadTypes] = useState<string[]>(['emitidas', 'recibidas']);
    const [selectedDownloadPeriods, setSelectedDownloadPeriods] = useState<string[]>([]);
    const [isDownloadingXml, setIsDownloadingXml] = useState(false);



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

                // 2. Auto-select first period (latest) if available AND no previous selection
                if (periods.length > 0 && !localStorage.getItem('active_year')) {
                    const latest = periods[0]; // '2025-01'
                    const y = latest.substring(0, 4);
                    const m = latest.substring(5, 7);
                    setYear(y);
                    setMonth(m);
                    localStorage.setItem('active_year', y);
                    localStorage.setItem('active_month', m);
                }
            } catch (e) {
                console.error("Failed to load periods", e);
            }
        };

        loadPeriods();
    }, [activeRfc]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [year, month, filterType, search, cfdiTipo, showCancelled]);

    useEffect(() => {
        if (!activeRfc) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRfc, year, month, filterType, search, cfdiTipo, showCancelled, page]);

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
                tipo: (filterType === 'all' || filterType === 'canceladas') ? undefined : filterType,
                cfdi_tipo: filterType === 'canceladas' ? undefined : cfdiTipo,
                status: filterType === 'canceladas' ? 'cancelados' : (showCancelled ? undefined : 'activos'),
                q: search,
                page: page,
                pageSize: 50
            });
            if (res && Array.isArray(res.data)) {
                setData(res.data);
                setTotalPages(res.last_page);
                setTotalCount(res.total);
            } else {
                setData([]);
                setTotalPages(1);
                setTotalCount(0);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const hasSerieFolio = data.some(c => c.serie || c.folio);
    const hasRetenciones = data.some(c => c.retenciones && Number(c.retenciones) > 0);

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

    // Resizing logic
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 320 && newWidth < 800) {
                setDrawerWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    const handleAutoSync = async (manual = false) => {
        setSyncing(true);
        try {
            const res = await startSync(activeRfc, manual);
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
            const res = await verifyStatus({
                rfc: activeRfc,
                year,
                month,
                tipo: (filterType === 'all' || filterType === 'canceladas') ? undefined : filterType,
                cfdi_tipo: filterType === 'canceladas' ? undefined : cfdiTipo
            });
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
            const y = val.substring(0, 4);
            const m = val.substring(5, 7);
            setYear(y);
            setMonth(m);
            localStorage.setItem('active_year', y);
            localStorage.setItem('active_month', m);
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
        <div className="text-gray-800 min-h-screen flex flex-col md:flex-row overflow-hidden relative">
            {/* Mobile Menu Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[25] md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed md:relative w-64 h-full flex-shrink-0 flex flex-col bg-white border-r border-gray-200 z-30 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="h-20 flex items-center px-6 border-b border-gray-100 justify-between">
                    <div className="flex items-center gap-2 text-[var(--primary)] font-bold text-xl tracking-tight">
                        <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                        <span>Fiscalio</span>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-400">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto">
                    <button
                        onClick={() => { fetchData(); setIsSidebarOpen(false); }}
                        className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 text-sm hover:bg-gray-50 mb-4"
                    >
                        <span className="material-symbols-outlined text-xl">refresh</span>
                        Actualizar Datos
                    </button>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Principal</div>
                    <button
                        onClick={() => { setCurrentView('invoices'); setIsSidebarOpen(false); }}
                        className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'invoices' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined text-xl">receipt_long</span>
                        Facturas
                    </button>
                    <button
                        onClick={() => { setCurrentView('accounts'); setIsSidebarOpen(false); }}
                        className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'accounts' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined text-xl">account_tree</span>
                        Cuentas
                    </button>
                    <button
                        onClick={() => { setCurrentView('provisional'); setIsSidebarOpen(false); }}
                        className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'provisional' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined text-xl">monitoring</span>
                        Control Prov.
                    </button>
                </nav>
            </aside>

            {/* Main Content */}
            {currentView === 'accounts' ? (
                <div className="flex-1 h-screen overflow-hidden">
                    <AccountsPage
                        activeRfc={activeRfc}
                        clientName={clientName || activeClientName || activeRfc}
                        onBack={() => setCurrentView('invoices')}
                    />
                </div>
            ) : currentView === 'provisional' ? (
                <div className="flex-1 h-screen overflow-hidden">
                    <ProvisionalControlPage
                        activeRfc={activeRfc}
                        clientName={clientName || activeClientName || activeRfc}
                        onBack={() => setCurrentView('invoices')}
                        initialYear={parseInt(year)}
                        initialMonth={parseInt(month)}
                        onPeriodChange={(y, m) => {
                            setYear(y.toString());
                            setMonth(m.toString().padStart(2, '0'));
                            localStorage.setItem('active_year', y.toString());
                            localStorage.setItem('active_month', m.toString().padStart(2, '0'));
                        }}
                    />
                </div>
            ) : (
                <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--background-light)] relative">
                    <header className="bg-white border-b border-gray-200 z-10 flex-shrink-0 h-auto md:h-20 px-4 lg:px-8 py-3 md:py-0 flex flex-col md:flex-row items-center justify-between shadow-sm gap-4">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <button
                                onClick={() => setIsSidebarOpen(true)}
                                className="p-2 md:hidden text-gray-500"
                            >
                                <span className="material-symbols-outlined">menu</span>
                            </button>
                            <div className="flex items-center gap-4 lg:gap-6 flex-1 md:flex-none overflow-hidden">
                                <button
                                    onClick={onBack || handleRfcChange}
                                    className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors text-xs lg:text-sm font-medium group flex-shrink-0"
                                >
                                    <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                                    <span className="hidden sm:inline">{onBack ? 'Dashboard' : 'Cambiar'}</span>
                                </button>
                                <div className="w-px h-8 md:h-10 bg-gray-200 flex-shrink-0"></div>
                                <div className="truncate">
                                    <h1 className="text-base md:text-xl lg:text-2xl font-bold text-gray-900 leading-tight truncate">{clientName || activeClientName || activeRfc}</h1>
                                    <p className="text-[10px] font-mono text-gray-500 tracking-wide mt-0.5 truncate">{activeRfc}</p>
                                </div>
                            </div>
                        </div>
                        {/* Header Filters */}
                        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                            <div className="relative w-full md:w-auto">
                                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-lg">calendar_month</span>
                                <select
                                    className="appearance-none border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-shadow cursor-pointer w-full md:min-w-[140px]"
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

                    <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex flex-col gap-3 sticky top-0 z-30 shadow-sm overflow-x-auto">
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
                                <button
                                    onClick={() => setFilterType('canceladas')}
                                    className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${filterType === 'canceladas' ? 'bg-red-600 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}
                                >
                                    Canceladas
                                </button>
                                {filterType !== 'canceladas' && (
                                    <div className="flex items-center gap-2 ml-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className={`w-8 h-4 rounded-full relative transition-all duration-300 ${showCancelled ? 'bg-red-500' : 'bg-gray-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={showCancelled}
                                                    onChange={e => setShowCancelled(e.target.checked)}
                                                    className="hidden"
                                                />
                                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-300 ${showCancelled ? 'left-4.5' : 'left-0.5'}`} style={{ left: showCancelled ? '18px' : '2px' }} />
                                            </div>
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${showCancelled ? 'text-red-600' : 'text-gray-400'}`}>Ver Canceladas</span>
                                        </label>
                                    </div>
                                )}
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
                                    onClick={() => exportInvoicesZip({
                                        rfc_user: activeRfc,
                                        year,
                                        month,
                                        tipo: (filterType === 'all' || filterType === 'canceladas') ? undefined : filterType,
                                        status: filterType === 'canceladas' ? 'cancelados' : (showCancelled ? undefined : 'activos'),
                                        q: search
                                    })}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all border border-gray-200"
                                >
                                    <span className="material-symbols-outlined text-sm">download</span>
                                    PDFs (ZIP)
                                </button>

                                <button
                                    onClick={handleVerifyBatch}
                                    disabled={verifying}
                                    className="flex items-center gap-2 px-4 py-2 bg-[#135bec] text-white text-xs font-bold rounded-xl hover:bg-[#0d47b7] disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
                                >
                                    <span className={`material-symbols-outlined text-sm ${verifying ? 'animate-spin' : ''}`}>fact_check</span>
                                    {verifying ? 'Verificando...' : 'Verificar Estatus'}
                                </button>

                                <button
                                    onClick={async () => {
                                        setShowDownloadXmlModal(true);
                                        const p = await getPeriods(activeRfc);
                                        setAvailablePeriods(p);
                                        const current = `${year}-${month}`;
                                        if (p.includes(current)) setSelectedDownloadPeriods([current]);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                                >
                                    <span className="material-symbols-outlined text-sm">download_for_offline</span>
                                    Descargar XMLs
                                </button>
                            </div>
                        </div>

                        {/* Secondary Filter Row: CFDI Type */}
                        {filterType !== 'canceladas' && (
                            <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tipo CFDI:</span>
                                    <div className="relative group">
                                        <select
                                            value={cfdiTipo}
                                            onChange={(e) => setCfdiTipo(e.target.value as any)}
                                            className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer min-w-[120px]"
                                        >
                                            <option value="I">Ingreso</option>
                                            <option value="E">Egreso</option>
                                            <option value="N">Nómina</option>
                                            <option value="P">Pago</option>
                                            <option value="T">Traslado</option>
                                            <option value="">Todos los tipos</option>
                                        </select>
                                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm group-hover:text-gray-600 transition-colors">expand_more</span>
                                    </div>
                                </div>
                                <div className="h-4 w-px bg-gray-200 mx-2"></div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                    <span className="text-[10px] font-medium text-gray-500">
                                        Vista actual: <span className="font-bold text-gray-700 capitalize">{filterType === 'all' ? 'Todas' : filterType}</span>
                                    </span>
                                </div>
                                <div className="h-4 w-px bg-gray-200 mx-2"></div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total:</span>
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-[10px] font-black">{totalCount}</span>
                                    <span className="text-[10px] text-gray-400 font-medium lowercase">facturas</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table & Drawer Container */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Main List Column */}
                        <div className="flex-1 flex flex-col min-w-0 bg-white">
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 sticky top-0 z-20">
                                        <tr>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                                                <span className="material-symbols-outlined text-base" title="Estado">info</span>
                                            </th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Fecha</th>
                                            {hasSerieFolio && (
                                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">S/F</th>
                                            )}
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">RFC / Nombre</th>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">Concepto</th>
                                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Total</th>
                                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">IVA</th>
                                            {hasRetenciones && (
                                                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Ret</th>
                                            )}
                                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Tipo</th>
                                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Met</th>
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
                                                {hasSerieFolio && (
                                                    <td className="px-3 py-3 whitespace-nowrap text-[10px] text-gray-500 font-mono">
                                                        {cfdi.serie || ''}{cfdi.folio || ''}
                                                    </td>
                                                )}
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
                                                {hasRetenciones && (
                                                    <td className="px-3 py-3 whitespace-nowrap text-xs text-right text-gray-600">
                                                        {cfdi.retenciones && Number(cfdi.retenciones) > 0 ? `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.retenciones)}` : '-'}
                                                    </td>
                                                )}
                                                <td className="px-3 py-3 whitespace-nowrap text-center">
                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-medium">{cfdi.tipo}</span>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${cfdi.metodo_pago === 'PUE' ? 'bg-blue-50 text-blue-600' : cfdi.metodo_pago === 'PPD' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                                        {cfdi.metodo_pago || '-'}
                                                    </span>
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

                            {/* Pagination Footer */}
                            {!loading && totalCount > 0 && (
                                <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Página:</span>
                                        <span className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-xs font-black">{page}</span>
                                        <span className="text-gray-300 mx-1">/</span>
                                        <span className="text-gray-500 text-xs font-bold">{totalPages}</span>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            <span className="material-symbols-outlined text-lg">arrow_back</span>
                                        </button>

                                        <div className="flex items-center gap-1.5">
                                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                // Simple logic to show pages around current page
                                                let pageNum = page;
                                                if (page <= 3) pageNum = i + 1;
                                                else if (page > totalPages - 2) pageNum = totalPages - 4 + i;
                                                else pageNum = page - 2 + i;

                                                if (pageNum <= 0 || pageNum > totalPages) return null;

                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setPage(pageNum)}
                                                        className={`w-8 h-8 rounded-xl text-[10px] font-bold transition-all ${page === pageNum ? 'bg-[#135bec] text-white shadow-lg shadow-blue-100' : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-200'}`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                        </button>
                                    </div>

                                    <div className="hidden sm:flex items-center gap-1">
                                        <span className="text-[10px] text-gray-400 font-medium">Mostrando</span>
                                        <span className="text-[10px] font-bold text-gray-700">{(page - 1) * 50 + 1}-{Math.min(page * 50, totalCount)}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">de {totalCount}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Drawer */}
                        {selectedUuid && (
                            <div
                                style={{ width: `${drawerWidth}px` }}
                                className="bg-white border-l border-gray-200 flex flex-col shadow-xl z-20 relative transition-[width] duration-75"
                            >
                                {/* Resize Handle */}
                                <div
                                    className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400/30 transition-colors z-30"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        setIsResizing(true);
                                    }}
                                />

                                <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100 flex-shrink-0">
                                    <h3 className="font-semibold text-gray-800 uppercase text-xs tracking-widest">Detalle de Factura</h3>
                                    <button onClick={() => setSelectedUuid(null)} className="text-gray-400 hover:text-gray-600">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
                                    {drawerLoading && (
                                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                            <div className="w-10 h-10 border-4 border-gray-100 border-t-blue-500 rounded-full animate-spin"></div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando factura...</p>
                                        </div>
                                    )}
                                    {!drawerLoading && selectedCfdi && (
                                        <>
                                            {/* Header: Name, RFC, UUID */}
                                            <div className="space-y-1">
                                                <h4 className="font-black text-gray-900 text-lg leading-tight uppercase">
                                                    {(() => {
                                                        const isEmitted = selectedCfdi.rfc_emisor === activeRfc;
                                                        return isEmitted ? selectedCfdi.name_receptor : selectedCfdi.name_emisor;
                                                    })() || 'Razón Social no disponible'}
                                                </h4>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                                                        {(() => {
                                                            const isEmitted = selectedCfdi.rfc_emisor === activeRfc;
                                                            return isEmitted ? selectedCfdi.rfc_receptor : selectedCfdi.rfc_emisor;
                                                        })()}
                                                    </span>
                                                    <span className="text-[10px] font-medium text-gray-300 font-mono break-all leading-none">{selectedCfdi.uuid}</span>
                                                </div>
                                            </div>

                                            {/* Status Row: SAT & Method */}
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${selectedCfdi.estado_sat === 'Vigente' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                                    {selectedCfdi.estado_sat || 'Sin Verificar'}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${selectedCfdi.metodo_pago === 'PUE' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                                    {selectedCfdi.metodo_pago || 'Metodo -'}
                                                </span>
                                                <div className="flex-1"></div>
                                                <button
                                                    onClick={handleRefreshStatus}
                                                    disabled={satStatusUpdating}
                                                    className="p-1.5 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors border border-gray-100"
                                                    title="Verificar en SAT"
                                                >
                                                    <span className={`material-symbols-outlined text-sm ${satStatusUpdating ? 'animate-spin' : ''}`}>sync</span>
                                                </button>
                                            </div>

                                            {/* Action Buttons: PDF, XML, ZIP */}
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    onClick={() => window.open(`/api/cfdis/${selectedCfdi.uuid}/pdf`, '_blank')}
                                                    className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-red-50 hover:border-red-100 group transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-red-500 text-lg">picture_as_pdf</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-red-600 uppercase mt-1">PDF</span>
                                                </button>
                                                <a
                                                    href={`/api/cfdis/${selectedCfdi.uuid}/xml`}
                                                    target="_blank"
                                                    className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-blue-50 hover:border-blue-100 group transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 text-lg">code</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-blue-600 uppercase mt-1">XML</span>
                                                </a>
                                                <button
                                                    onClick={() => window.open(`/api/cfdis/${selectedCfdi.uuid}/zip`, '_blank')}
                                                    className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 group transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 text-lg">inventory_2</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-gray-600 uppercase mt-1">ZIP</span>
                                                </button>
                                            </div>

                                            {/* Financials List */}
                                            <div className="bg-gray-50/50 rounded-2xl p-4 space-y-3">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-gray-400 font-bold uppercase tracking-wider">Subtotal</span>
                                                    <span className="text-gray-600 font-black">
                                                        ${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.subtotal) || 0)}
                                                    </span>
                                                </div>
                                                {selectedCfdi.descuento && Number(selectedCfdi.descuento) > 0 && (
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-gray-400 font-bold uppercase tracking-wider">Descuento</span>
                                                        <span className="text-gray-600 font-black">-${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.descuento))}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-gray-400 font-bold uppercase tracking-wider">IVA (16%)</span>
                                                    <span className="text-gray-600 font-black">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.iva) || 0)}</span>
                                                </div>
                                                {selectedCfdi.retenciones && Number(selectedCfdi.retenciones) > 0 && (
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-red-400 font-bold uppercase tracking-wider">Retenciones</span>
                                                        <span className="text-red-600 font-black">-${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.retenciones))}</span>
                                                    </div>
                                                )}
                                                <div className="h-px bg-gray-100 my-1"></div>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-900 font-black uppercase tracking-widest">Total</span>
                                                        <span className="text-[8px] font-bold text-gray-400">{selectedCfdi.moneda || 'MXN'} {selectedCfdi.tipo_cambio && selectedCfdi.tipo_cambio > 1 ? `(TC: ${selectedCfdi.tipo_cambio})` : ''}</span>
                                                    </div>
                                                    <span className="text-lg text-gray-900 font-black tracking-tight">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.total))}</span>
                                                </div>
                                            </div>

                                            {/* Info Adicional */}
                                            <div className="grid grid-cols-2 gap-4 bg-white border border-gray-100 rounded-2xl p-4">
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Forma de Pago</span>
                                                    <p className="text-[10px] font-black text-gray-700">{selectedCfdi.forma_pago || '01'} - Efectivo</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Uso CFDI</span>
                                                    <p className="text-[10px] font-black text-gray-700">{selectedCfdi.uso_cfdi || 'G03'} - Gastos en gral.</p>
                                                </div>
                                            </div>

                                            {/* Accounting Classification */}
                                            <div className="space-y-4">
                                                <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Clasificación Contable</h5>

                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Categoría de Gasto</label>
                                                    <div className="relative group">
                                                        <select className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 cursor-pointer">
                                                            <option>Sin categoría</option>
                                                            <option>Gastos Generales</option>
                                                            <option>Arrendamientos</option>
                                                            <option>Honorarios</option>
                                                            <option>Viáticos</option>
                                                        </select>
                                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm group-hover:text-gray-600">expand_more</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-400 uppercase ml-1">Cuenta Contable</label>
                                                    <div className="relative group">
                                                        <select className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/10 cursor-pointer">
                                                            <option>Sin cuenta</option>
                                                            <option>602-01 Gastos de Venta</option>
                                                            <option>603-01 Gastos de Administración</option>
                                                        </select>
                                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm group-hover:text-gray-600">expand_more</span>
                                                    </div>
                                                </div>

                                                <label className="flex items-center gap-3 cursor-pointer group">
                                                    <div className="relative flex items-center justify-center">
                                                        <input type="checkbox" className="peer appearance-none w-5 h-5 border border-gray-200 rounded-lg bg-white checked:bg-gray-900 checked:border-gray-900 transition-all cursor-pointer" />
                                                        <span className="material-symbols-outlined absolute text-white text-sm scale-0 peer-checked:scale-100 transition-all pointer-events-none">check</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-700 transition-colors uppercase select-none">Recordar para este proveedor</span>
                                                </label>
                                            </div>

                                            {/* Errors Section */}
                                            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="material-symbols-outlined text-red-500 text-sm">warning</span>
                                                    <h5 className="text-[10px] font-black text-red-600 uppercase tracking-widest">Avisos y Errores</h5>
                                                </div>
                                                <ul className="space-y-2">
                                                    <li className="flex gap-2 text-[10px] text-red-500 font-medium">
                                                        <span className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0"></span>
                                                        <span>Factura PPD sin complemento de pago asociado detectado.</span>
                                                    </li>
                                                    <li className="flex gap-2 text-[10px] text-red-500 font-medium">
                                                        <span className="w-1 h-1 rounded-full bg-red-400 mt-1.5 shrink-0"></span>
                                                        <span>El RFC emisor no coincide con los patrones de gasto habituales.</span>
                                                    </li>
                                                </ul>
                                            </div>

                                            {/* Fixed Footer Spacer */}
                                            <div className="h-16"></div>
                                        </>
                                    )}
                                </div>

                                {/* Drawer Footer */}
                                {!drawerLoading && selectedCfdi && (
                                    <div className="absolute bottom-0 left-0 right-0 p-5 bg-white border-t border-gray-100 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] flex-shrink-0">
                                        <button className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl hover:bg-black transition-all text-xs uppercase tracking-[0.2em] shadow-lg shadow-gray-200 active:scale-[0.98]">
                                            Guardar Cambios
                                        </button>
                                    </div>
                                )}
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
            )}
            {/* Download XML Modal */}
            {showDownloadXmlModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm shadow-2xl" onClick={() => !isDownloadingXml && setShowDownloadXmlModal(false)}></div>
                    <div className="relative bg-white w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Descargar Facturas XML</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Configura tu exportación masiva</p>
                            </div>
                            <button onClick={() => setShowDownloadXmlModal(false)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all">
                                <span className="material-symbols-outlined text-gray-400">close</span>
                            </button>
                        </div>

                        <div className="p-10 space-y-8 max-h-[500px] overflow-y-auto custom-scrollbar bg-white">
                            {/* Filter Section */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">1. Selecciona el Tipo</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {['emitidas', 'recibidas'].map(t => {
                                        const isSelected = downloadTypes.includes(t);
                                        return (
                                            <button
                                                key={t}
                                                onClick={() => {
                                                    if (isSelected) setDownloadTypes(downloadTypes.filter(s => s !== t));
                                                    else setDownloadTypes([...downloadTypes, t]);
                                                }}
                                                className={`p-6 rounded-[28px] border-2 text-left transition-all ${isSelected ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}>
                                                        {isSelected && <span className="material-symbols-outlined text-white text-xs">check</span>}
                                                    </div>
                                                    <div className={`text-sm font-black uppercase tracking-widest ${isSelected ? 'text-emerald-700' : 'text-gray-500'}`}>
                                                        {t === 'emitidas' ? 'Emitidas (Ventas)' : 'Recibidas (Gastos)'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Periods Section */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">2. Selecciona los Periodos</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {availablePeriods.length === 0 ? (
                                        <div className="col-span-3 text-center py-10 text-gray-400 font-bold bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">No hay periodos disponibles</div>
                                    ) : (
                                        availablePeriods.map(p => {
                                            const isSelected = selectedDownloadPeriods.includes(p);
                                            return (
                                                <button
                                                    key={p}
                                                    onClick={() => {
                                                        if (isSelected) setSelectedDownloadPeriods(selectedDownloadPeriods.filter(s => s !== p));
                                                        else setSelectedDownloadPeriods([...selectedDownloadPeriods, p]);
                                                    }}
                                                    className={`p-4 rounded-2xl border-2 text-center transition-all ${isSelected ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 bg-white'}`}
                                                >
                                                    <div className={`text-xs font-black uppercase tracking-tight ${isSelected ? 'text-emerald-700' : 'text-gray-500'}`}>{p}</div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-10 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
                            <div>
                                <div className="text-white font-black text-lg">ZIP Listo</div>
                                <div className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                    {selectedDownloadPeriods.length} periodos · {downloadTypes.length} tipos
                                </div>
                            </div>
                            <button
                                disabled={selectedDownloadPeriods.length === 0 || downloadTypes.length === 0 || isDownloadingXml}
                                onClick={async () => {
                                    try {
                                        setIsDownloadingXml(true);
                                        const pArray = selectedDownloadPeriods.map(s => {
                                            const [y, m] = s.split('-');
                                            return { year: parseInt(y), month: parseInt(m) };
                                        });
                                        const blob = await downloadProvisionalXmlZip(activeRfc, pArray, downloadTypes);
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `Facturas_SAT_${activeRfc}.zip`;
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        setShowDownloadXmlModal(false);
                                    } catch (err: any) {
                                        alert(err.message);
                                    } finally {
                                        setIsDownloadingXml(false);
                                    }
                                }}
                                className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 text-white px-10 py-5 rounded-[24px] text-[11px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-4 shadow-xl shadow-emerald-900/40"
                            >
                                {isDownloadingXml ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                        Verificando SAT...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-lg">download</span>
                                        Comenzar Descarga
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
