
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { listCfdis, getCfdi, refreshCfdiStatus, getPeriods, startSync, verifyStatus, getActiveRequests, exportInvoicesZip, downloadProvisionalXmlZip, exportCfdisExcel, logout, exportCfdiPdf, exportCfdiXml, exportCfdiZip, uploadCfdis, triggerScraperFiel, createManualRequest, suggestCfdis, authFetch } from '../services';
import { API_BASE_URL } from '../api/config';
import { AccountsPage } from './AccountsPage';
import { ProvisionalControlPage } from './ProvisionalControlPage';
import { BankStatementPage } from './BankStatementPage';
import { ReconciliationPage } from './ReconciliationPage';
import { SatDocumentsPage } from './SatDocumentsPage';
import type { Cfdi } from '../models';

export const InvoicesPage = ({ activeRfc, onBack, clientName, initialSyncAt, activeValidUntil }: { activeRfc: string, onBack?: () => void, clientName?: string, initialSyncAt?: string, activeValidUntil?: string }) => {
    const [year, setYear] = useState(localStorage.getItem('active_year') || new Date().getFullYear().toString());
    const [month, setMonth] = useState(localStorage.getItem('active_month') || (new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [filterType, setFilterType] = useState<'all' | 'emitidas' | 'recibidas' | 'canceladas'>('all');
    const [cfdiTipo, setCfdiTipo] = useState<'I' | 'E' | 'N' | 'P' | 'T' | ''>('I');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionHighlight, setSuggestionHighlight] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
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
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialSyncAt || null);
    const [verifying, setVerifying] = useState(false);
    const [verificationSummary, setVerificationSummary] = useState<any>(null);
    const [activeRequests, setActiveRequests] = useState<any[]>([]);
    const [drawerWidth, setDrawerWidth] = useState(360);
    const [isResizing, setIsResizing] = useState(false);
    const [currentView, setCurrentView] = useState<'invoices' | 'accounts' | 'provisional' | 'banks' | 'reconciliation' | 'sat-docs'>('invoices');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [contabilidadOpen, setContabilidadOpen] = useState(true);

    // --- Column sort (not persisted) ---
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const handleSort = useCallback((field: string) => {
        setSortField(prev => {
            if (prev === field) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return field;
            }
            setSortDir('asc');
            return field;
        });
    }, []);

    // --- Column widths (persisted) ---
    const defaultColWidths: Record<string, number> = {
        status: 40, fecha: 96, serieFolio: 48, rfcNombre: 160,
        concepto: 256, total: 96, iva: 80, ret: 80,
        tipo: 64, met: 64, estatusSat: 128, uuid: 120, actions: 32,
    };
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        try {
            const saved = localStorage.getItem('invoices_col_widths');
            if (!saved) return defaultColWidths;
            const parsed = JSON.parse(saved);
            // Reset serieFolio si viene del default viejo (80) para forzar el nuevo (48)
            if (parsed.serieFolio === 80) parsed.serieFolio = 48;
            return { ...defaultColWidths, ...parsed };
        } catch { return defaultColWidths; }
    });

    useEffect(() => {
        localStorage.setItem('invoices_col_widths', JSON.stringify(colWidths));
    }, [colWidths]);

    const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

    const startColResize = useCallback((colId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = { colId, startX: e.clientX, startWidth: colWidths[colId] };
        document.body.style.cursor = 'col-resize';
    }, [colWidths]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const { colId, startX, startWidth } = resizingRef.current;
            const newWidth = Math.max(24, startWidth + (e.clientX - startX));
            setColWidths(prev => ({ ...prev, [colId]: newWidth }));
        };
        const handleMouseUp = () => {
            if (resizingRef.current) {
                resizingRef.current = null;
                document.body.style.cursor = 'default';
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const [showCancelled, setShowCancelled] = useState(false);
    const [showDownloadXmlModal, setShowDownloadXmlModal] = useState(false);
    const [downloadTypes, setDownloadTypes] = useState<string[]>(['emitidas', 'recibidas']);
    const [selectedDownloadPeriods, setSelectedDownloadPeriods] = useState<string[]>([]);
    const [isDownloadingXml, setIsDownloadingXml] = useState(false);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const [showExportModal, setShowExportModal] = useState(false);

    const [isScrapingFiel, setIsScrapingFiel] = useState(false);

    // PDF inline preview modal
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [pdfPreviewTitle, setPdfPreviewTitle] = useState('');
    const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);

    const handlePreviewPdf = async (uuid: string, title: string) => {
        setPdfPreviewTitle(title);
        setPdfPreviewLoading(true);
        setPdfPreviewUrl(null);
        try {
            const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}/pdf?inline=1`);
            if (!response.ok) throw new Error('Error al cargar PDF');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
        } catch {
            alert('No se pudo abrir el PDF');
        } finally {
            setPdfPreviewLoading(false);
        }
    };

    const handleClosePdfPreview = () => {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl(null);
        setPdfPreviewTitle('');
    };

    const [showManualRequestModal, setShowManualRequestModal] = useState(false);
    const [manualRequest, setManualRequest] = useState({
        start_date: '',
        end_date: '',
        type: 'all'
    });
    const [isSubmittingManual, setIsSubmittingManual] = useState(false);

    const handleManualRequestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualRequest.start_date || !manualRequest.end_date) {
            alert('Por favor selecciona las fechas');
            return;
        }

        try {
            setIsSubmittingManual(true);
            await createManualRequest(activeRfc, manualRequest.start_date, manualRequest.end_date, manualRequest.type);
            alert('Solicitud creada correctamente. El sistema la procesará en unos momentos.');
            setShowManualRequestModal(false);
            // Refresh active requests
            const reqs = await getActiveRequests(activeRfc);
            setActiveRequests(reqs);
        } catch (error: any) {
            alert(error.message || 'Error al crear solicitud');
        } finally {
            setIsSubmittingManual(false);
        }
    };

    const fielStatus = React.useMemo(() => {
        if (!activeValidUntil) return null;
        const validMs = new Date(activeValidUntil.replace(" ", "T")).getTime();
        const nowMs = Date.now();
        const diffDays = Math.ceil((validMs - nowMs) / (1000 * 60 * 60 * 24));
        const expirationDateStr = new Date(validMs).toLocaleDateString('es-MX', { year: '2-digit', month: 'short', day: 'numeric' });

        if (diffDays < 0) {
            return {
                text: `FIEL vencida (${Math.abs(diffDays)}d) - Venció: ${expirationDateStr}`,
                icon: 'warning',
                className: 'text-red-700 bg-red-50 border-red-200'
            };
        } else if (diffDays <= 30) {
            return {
                text: `FIEL vence en ${diffDays}d (${expirationDateStr})`,
                icon: 'schedule',
                className: 'text-orange-700 bg-orange-50 border-orange-200'
            };
        } else {
            return {
                text: `FIEL vigente (hasta ${expirationDateStr})`,
                icon: 'verified',
                className: 'text-gray-500 bg-gray-50 border-gray-200'
            };
        }
    }, [activeValidUntil]);

    const [exportColumns, setExportColumns] = useState<string[]>([
        'uuid', 'fecha', 'serie', 'folio', 'rfc_emisor', 'name_emisor', 'rfc_receptor', 'name_receptor',
        'concepto', 'subtotal', 'iva', 'retenciones', 'total', 'moneda', 'tipo', 'metodo_pago', 'estado_sat'
    ]);
    const allColumns = [
        { id: 'uuid', label: 'UUID' },
        { id: 'fecha', label: 'Fecha Emisión' },
        { id: 'fecha_fiscal', label: 'Fecha Fiscal' },
        { id: 'serie', label: 'Serie' },
        { id: 'folio', label: 'Folio' },
        { id: 'rfc_emisor', label: 'RFC Emisor' },
        { id: 'name_emisor', label: 'Nombre Emisor' },
        { id: 'rfc_receptor', label: 'RFC Receptor' },
        { id: 'name_receptor', label: 'Nombre Receptor' },
        { id: 'concepto', label: 'Concepto (Principal)' },
        { id: 'subtotal', label: 'Subtotal' },
        { id: 'descuento', label: 'Descuento' },
        { id: 'iva', label: 'IVA' },
        { id: 'retenciones', label: 'Retenciones' },
        { id: 'total', label: 'Total' },
        { id: 'moneda', label: 'Moneda' },
        { id: 'tipo_cambio', label: 'Tipo Cambio' },
        { id: 'forma_pago', label: 'Forma Pago' },
        { id: 'metodo_pago', label: 'Método Pago' },
        { id: 'uso_cfdi', label: 'Uso CFDI' },
        { id: 'tipo', label: 'Tipo CFDI' },
        { id: 'estado_sat', label: 'Estado SAT' },
    ];



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

    // Debounce search input — wait 400ms after last keystroke before triggering a fetch
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch suggestions with 300ms debounce
    useEffect(() => {
        if (search.length < 2) { setSuggestions([]); return; }
        const timer = setTimeout(async () => {
            const results = await suggestCfdis(search, activeRfc);
            setSuggestions(results);
            setSuggestionHighlight(-1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, activeRfc]);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [year, month, filterType, debouncedSearch, cfdiTipo, showCancelled]);

    useEffect(() => {
        if (!activeRfc) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRfc, year, month, filterType, debouncedSearch, cfdiTipo, showCancelled, page]);

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
                q: debouncedSearch,
                page: page,
                pageSize: 10
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

    const sortedData = useMemo(() => {
        if (!sortField) return data;
        return [...data].sort((a: any, b: any) => {
            let av = a[sortField];
            let bv = b[sortField];
            if (['total', 'iva', 'retenciones', 'subtotal'].includes(sortField)) {
                return sortDir === 'asc' ? (Number(av) || 0) - (Number(bv) || 0) : (Number(bv) || 0) - (Number(av) || 0);
            }
            av = String(av ?? '').toLowerCase();
            bv = String(bv ?? '').toLowerCase();
            return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [data, sortField, sortDir]);

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

    // Removed auto-sync on load per user request

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
                // Also update local storage so Dashboard is aware when going back
                localStorage.setItem('active_last_sync', res.last_sync);
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

    const handleScrapeFielClick = async () => {
        if (!activeRfc) return;
        setIsScrapingFiel(true);
        try {
            await triggerScraperFiel(activeRfc);
        } catch (e: any) {
            console.error("Scraper failed", e);
            alert("Error: " + e.message);
        } finally {
            setIsScrapingFiel(false);
        }
    };

    const getNextSyncText = () => {
        if (!lastSyncAt) return 'Sincronizar (Manual)';
        const last = new Date(lastSyncAt.replace(" ", "T"));
        const next = new Date(last.getTime() + (12 * 60 * 60 * 1000));
        const now = new Date();
        if (now > next) return 'Sincronizar ahora';
        const diffMins = Math.floor((next.getTime() - now.getTime()) / 60000);
        const h = Math.floor(diffMins / 60);
        const m = diffMins % 60;
        return `Auto en ${h}h ${m}m | Forzar`;
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

    const processFiles = async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        setIsUploading(true);
        setUploadResult(null);
        try {
            const result = await uploadCfdis(files, activeRfc);
            setUploadResult(result);
            fetchData(); // Refresh list automatically
            if (activeRfc) {
                getPeriods(activeRfc).then(setAvailablePeriods);
            }
        } catch (error: any) {
            setUploadResult({ success: false, message: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            await processFiles(event.target.files);
            event.target.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragOver) setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await processFiles(e.dataTransfer.files);
        }
    };

    return (
        <div className="text-gray-800 h-screen flex flex-col md:flex-row overflow-hidden relative">
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
                    <div
                        className="flex items-center gap-2 font-bold text-xl tracking-tight cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={onBack || handleRfcChange}
                    >
                        <img src="/img/fiscalio-logo.png" alt="Fiscalio Logo" className="h-8 object-contain" />
                        <span className="text-gray-900">Fiscalio</span>
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
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Módulos</div>
                    <button
                        onClick={() => { setCurrentView('invoices'); setIsSidebarOpen(false); }}
                        className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'invoices' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined text-xl">receipt_long</span>
                        Facturacion
                    </button>

                    <div className="mt-4">
                        <button
                            onClick={() => setContabilidadOpen(!contabilidadOpen)}
                            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                        >
                            Contabilidad
                            <span className={`material-symbols-outlined text-sm transition-transform ${contabilidadOpen ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {contabilidadOpen && (
                            <div className="flex flex-col gap-1 mt-1 pl-2">
                                <button
                                    onClick={() => { setCurrentView('accounts'); setIsSidebarOpen(false); }}
                                    className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'accounts' ? 'active bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">account_tree</span>
                                    Cuentas
                                </button>
                                <button
                                    onClick={() => { setCurrentView('banks'); setIsSidebarOpen(false); }}
                                    className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'banks' ? 'active bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">account_balance</span>
                                    Bancos
                                </button>
                                <button
                                    onClick={() => { setCurrentView('reconciliation'); setIsSidebarOpen(false); }}
                                    className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'reconciliation' ? 'active bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">balance</span>
                                    Conciliaciones
                                </button>
                                <button
                                    className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 cursor-not-allowed"
                                    title="Próximamente"
                                >
                                    <span className="material-symbols-outlined text-lg">description</span>
                                    Pólizas
                                </button>
                                <button
                                    className="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 cursor-not-allowed"
                                    title="Próximamente"
                                >
                                    <span className="material-symbols-outlined text-lg">analytics</span>
                                    Reportes
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="mt-4">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">Herramientas</div>
                        <button
                            onClick={() => { setCurrentView('provisional'); setIsSidebarOpen(false); }}
                            className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'provisional' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <span className="material-symbols-outlined text-xl">monitoring</span>
                            Control Prov.
                        </button>
                        <button
                            onClick={() => { setCurrentView('sat-docs'); setIsSidebarOpen(false); }}
                            className={`nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${currentView === 'sat-docs' ? 'active bg-gray-900 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <span className="material-symbols-outlined text-xl">description</span>
                            Docs SAT
                        </button>
                    </div>
                </nav>
                <div className="p-4 border-t border-gray-100 mt-auto">
                    <button onClick={() => logout()} title="Cerrar sesión" className="w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 text-sm font-medium transition-all">
                        <span className="material-symbols-outlined text-xl">logout</span>
                        Cerrar Sesión
                    </button>
                </div>
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
            ) : currentView === 'banks' ? (
                <div className="flex-1 h-screen overflow-hidden">
                    <BankStatementPage
                        activeRfc={activeRfc}
                        clientName={clientName || activeClientName || activeRfc}
                        onBack={() => setCurrentView('invoices')}
                    />
                </div>
            ) : currentView === 'reconciliation' ? (
                <div className="flex-1 h-screen overflow-hidden">
                    <ReconciliationPage
                        activeRfc={activeRfc}
                        clientName={clientName || activeClientName || activeRfc}
                        onBack={() => setCurrentView('invoices')}
                    />
                </div>
            ) : currentView === 'sat-docs' ? (
                <div className="flex-1 h-screen overflow-hidden">
                    <SatDocumentsPage
                        activeRfc={activeRfc}
                        clientName={clientName || activeClientName || activeRfc}
                        onBack={() => setCurrentView('invoices')}
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
                                <div className="truncate flex flex-col items-start">
                                    <h1 className="text-base md:text-xl lg:text-2xl font-bold text-gray-900 leading-tight truncate">{clientName || activeClientName || activeRfc}</h1>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[10px] font-mono text-gray-500 tracking-wide truncate">{activeRfc}</p>
                                        {fielStatus && (
                                            <div className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${fielStatus.className}`}>
                                                <span className="material-symbols-outlined text-[10px]">{fielStatus.icon}</span>
                                                {fielStatus.text}
                                            </div>
                                        )}
                                    </div>
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
                            {/* Smart search with suggestions */}
                            <div ref={searchRef} className="relative min-w-[300px]">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg z-10">search</span>
                                <input
                                    className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
                                    placeholder="RFC, razón social, UUID, monto, fecha..."
                                    type="text"
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                                    onFocus={() => { if (search.length >= 2) setShowSuggestions(true); }}
                                    onKeyDown={e => {
                                        if (!showSuggestions || suggestions.length === 0) return;
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
                                        else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionHighlight(h => Math.max(h - 1, 0)); }
                                        else if (e.key === 'Enter' && suggestionHighlight >= 0) {
                                            e.preventDefault();
                                            const s = suggestions[suggestionHighlight];
                                            const val = s._fill;
                                            setSearch(val); setDebouncedSearch(val); setShowSuggestions(false);
                                        }
                                        else if (e.key === 'Escape') setShowSuggestions(false);
                                    }}
                                />
                                {search.length > 0 && (
                                    <button
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                                        onMouseDown={e => { e.preventDefault(); setSearch(''); setDebouncedSearch(''); setSuggestions([]); setShowSuggestions(false); }}
                                    >
                                        <span className="material-symbols-outlined text-base">close</span>
                                    </button>
                                )}
                                {/* Suggestions dropdown */}
                                {showSuggestions && suggestions.length > 0 && (() => {
                                    // Build deduplicated suggestion list with category detection
                                    const ql = search.toLowerCase();
                                    const seen = new Set<string>();
                                    const items: { key: string; type: string; icon: string; color: string; primary: string; secondary: string; _fill: string }[] = [];

                                    suggestions.forEach(cfdi => {
                                        const otherRfc = cfdi.rfc_emisor === activeRfc ? cfdi.rfc_receptor : cfdi.rfc_emisor;
                                        const otherName = cfdi.rfc_emisor === activeRfc ? cfdi.name_receptor : cfdi.name_emisor;

                                        const push = (type: string, icon: string, color: string, primary: string, secondary: string, fill: string) => {
                                            const key = `${type}:${fill}`;
                                            if (!seen.has(key) && items.length < 10) { seen.add(key); items.push({ key, type, icon, color, primary, secondary, _fill: fill }); }
                                        };

                                        if (otherRfc?.toLowerCase().includes(ql)) push('RFC', 'badge', 'text-blue-600 bg-blue-50', otherRfc, otherName || '', otherRfc);
                                        if (otherName?.toLowerCase().includes(ql)) push('Razón Social', 'business', 'text-violet-600 bg-violet-50', otherName, otherRfc || '', otherName);
                                        if (cfdi.uuid?.toLowerCase().includes(ql)) push('UUID', 'fingerprint', 'text-gray-600 bg-gray-100', cfdi.uuid, '', cfdi.uuid);
                                        if (cfdi.concepto?.toLowerCase().includes(ql)) push('Concepto', 'description', 'text-emerald-600 bg-emerald-50', cfdi.concepto.substring(0, 60), '', cfdi.concepto);
                                        if (String(cfdi.total).includes(search)) push('Monto', 'payments', 'text-orange-600 bg-orange-50', `$${Number(cfdi.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, '', String(cfdi.total));
                                        if (cfdi.fecha_fiscal?.includes(search)) push('Fecha', 'calendar_today', 'text-teal-600 bg-teal-50', cfdi.fecha_fiscal?.substring(0, 10) || '', '', cfdi.fecha_fiscal?.substring(0, 10) || '');
                                    });

                                    if (items.length === 0) return null;
                                    return (
                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                            <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sugerencias</span>
                                                <span className="text-[10px] text-gray-300">{items.length} resultado{items.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            {items.map((item, idx) => (
                                                <div
                                                    key={item.key}
                                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${suggestionHighlight === idx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                                    onMouseEnter={() => setSuggestionHighlight(idx)}
                                                    onMouseDown={e => {
                                                        e.preventDefault();
                                                        setSearch(item._fill);
                                                        setDebouncedSearch(item._fill);
                                                        setShowSuggestions(false);
                                                    }}
                                                >
                                                    <span className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${item.color}`}>
                                                        <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-semibold text-gray-800 truncate block">{item.primary}</span>
                                                        {item.secondary && <span className="text-[10px] text-gray-400 truncate block">{item.secondary}</span>}
                                                    </div>
                                                    <span className={`flex-shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${item.color}`}>{item.type}</span>
                                                </div>
                                            ))}
                                            <div
                                                className="px-3 py-2 border-t border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
                                                onMouseDown={e => { e.preventDefault(); setShowSuggestions(false); setDebouncedSearch(search); }}
                                            >
                                                <span className="material-symbols-outlined text-gray-400 text-base">search</span>
                                                <span className="text-xs text-gray-500">Buscar <span className="font-semibold text-gray-700">"{search}"</span> en todos los campos</span>
                                            </div>
                                        </div>
                                    );
                                })()}
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
                                    title={lastSyncAt ? `Última sincronización: ${new Date(lastSyncAt.replace(" ", "T")).toLocaleString()}` : 'Aún no sincronizado'}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider transition-all shadow-sm ${syncing ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}>
                                    <span className={`material-symbols-outlined text-base ${syncing ? 'animate-spin' : ''}`}>sync</span>
                                    {syncing ? 'Sincronizando...' : getNextSyncText()}
                                </button>

                                <button
                                    onClick={() => setShowManualRequestModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10.5px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-100"
                                >
                                    <span className="material-symbols-outlined text-base">add_circle</span>
                                    Solicitud Manual
                                </button>

                                <button
                                    onClick={handleScrapeFielClick}
                                    disabled={isScrapingFiel}
                                    title="Descarga Constancia de Situación Fiscal y Opinión 32-D usando la e.firma"
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10.5px] font-bold uppercase tracking-wider transition-all shadow-sm ${isScrapingFiel ? 'bg-orange-50 border-orange-100 text-orange-600' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}>
                                    <span className={`material-symbols-outlined text-base ${isScrapingFiel ? 'animate-spin' : ''}`}>{isScrapingFiel ? 'downloading' : 'security'}</span>
                                    {isScrapingFiel ? 'Extrayendo...' : 'Robot FIEL'}
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
                                    onClick={() => setShowExportModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                                >
                                    <span className="material-symbols-outlined text-sm">table_view</span>
                                    Excel
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

                                {/* Upload XMLs / ZIPs Button */}
                                <div className="relative">
                                    <input
                                        type="file"
                                        multiple
                                        accept=".xml,.zip"
                                        id="upload-cfdis"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={isUploading}
                                    />
                                    <label
                                        htmlFor="upload-cfdis"
                                        className={`flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-xl transition-all shadow-lg cursor-pointer ${isUploading ? 'bg-indigo-400 cursor-not-allowed shadow-indigo-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                                            }`}
                                    >
                                        <span className={`material-symbols-outlined text-sm ${isUploading ? 'animate-bounce' : ''}`}>cloud_upload</span>
                                        {isUploading ? 'Subiendo...' : 'Subir XML/ZIP'}
                                    </label>
                                </div>
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
                        <div
                            className="flex-1 flex flex-col min-w-0 bg-white relative"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            {/* Drag overlay */}
                            {isDragOver && (
                                <div className="absolute inset-0 z-50 bg-indigo-50/90 border-4 border-dashed border-indigo-400 rounded-xl flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none transition-all">
                                    <span className="material-symbols-outlined text-6xl text-indigo-500 mb-4 animate-bounce">cloud_upload</span>
                                    <h3 className="text-2xl font-black text-indigo-900 tracking-tight">Suelta tus archivos aquí</h3>
                                    <p className="text-indigo-600 font-medium mt-2">Puedes soltar archivos .xml o .zip de facturas</p>
                                </div>
                            )}

                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-50 sticky top-0 z-20">
                                        <tr>
                                            {/* Helper: ResizableTh renders a header cell with sort+resize */}
                                            {(() => {
                                                const ResizableTh = ({ colId, label, sortable = false, align = 'left', children }: { colId: string; label?: string; sortable?: boolean; align?: string; children?: React.ReactNode }) => (
                                                    <th
                                                        style={{ width: colWidths[colId], minWidth: colWidths[colId], position: 'relative', userSelect: 'none' }}
                                                        className={`px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-${align} ${sortable ? 'cursor-pointer hover:bg-gray-100 group' : ''}`}
                                                        onClick={sortable ? () => handleSort(colId) : undefined}
                                                    >
                                                        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                                                            {children ?? label}
                                                            {sortable && (
                                                                <span className={`material-symbols-outlined text-[13px] transition-all flex-shrink-0 ${sortField === colId ? 'text-blue-500 opacity-100' : 'opacity-0 group-hover:opacity-40 text-gray-400'}`}>
                                                                    {sortField === colId ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Resize handle */}
                                                        <div
                                                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/50 transition-colors z-10"
                                                            onMouseDown={(e) => startColResize(colId, e)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </th>
                                                );
                                                return (
                                                    <>
                                                        <ResizableTh colId="status" align="center">
                                                            <span className="material-symbols-outlined text-base" title="Estado">info</span>
                                                        </ResizableTh>
                                                        <ResizableTh colId="fecha" label="Fecha" sortable align="left" />
                                                        {hasSerieFolio && <ResizableTh colId="serieFolio" label="S/F" align="left" />}
                                                        <ResizableTh colId="rfcNombre" label="RFC / Nombre" align="left" />
                                                        <ResizableTh colId="concepto" label="Concepto" align="left" />
                                                        <ResizableTh colId="total" label="Total / Pagado" sortable align="right" />
                                                        <ResizableTh colId="iva" label="IVA / F.Pago" sortable align="right" />
                                                        {hasRetenciones && <ResizableTh colId="ret" label="Ret" sortable align="right" />}
                                                        <ResizableTh colId="tipo" label="Tipo" sortable align="center" />
                                                        <ResizableTh colId="met" label="Met" sortable align="center" />
                                                        <ResizableTh colId="estatusSat" label="Estatus SAT" sortable align="center" />
                                                        <ResizableTh colId="uuid" label="UUID" align="left" />
                                                        <th style={{ width: colWidths.actions, minWidth: colWidths.actions }} className="px-1"></th>
                                                    </>
                                                );
                                            })()}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-300">
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
                                        {sortedData.map(cfdi => (
                                            <tr
                                                key={cfdi.uuid}
                                                onClick={() => setSelectedUuid(cfdi.uuid)}
                                                className={`group table-row-hover hover:bg-blue-50/40 cursor-pointer transition-colors ${selectedUuid === cfdi.uuid ? 'bg-emerald-50' : cfdi.tipo === 'P' ? 'bg-violet-50/30' : ''}`}
                                            >
                                                {/* Estado vigente/cancelado */}
                                                <td style={{ width: colWidths.status }} className="px-3 py-4 whitespace-nowrap text-center overflow-hidden">
                                                    {cfdi.es_cancelado ? (
                                                        <span className="material-symbols-outlined text-red-500 text-lg">cancel</span>
                                                    ) : (
                                                        <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                                                    )}
                                                </td>
                                                {/* Fecha */}
                                                <td style={{ width: colWidths.fecha }} className="px-3 py-4 whitespace-nowrap text-xs font-semibold text-gray-700 overflow-hidden">
                                                    {cfdi.fecha ? cfdi.fecha.substring(0, 10) : '-'}
                                                </td>
                                                {hasSerieFolio && (
                                                    <td style={{ width: colWidths.serieFolio }} className="px-3 py-4 whitespace-nowrap text-[10px] text-gray-500 font-mono overflow-hidden">
                                                        {cfdi.serie || ''}{cfdi.folio || ''}
                                                    </td>
                                                )}
                                                {/* RFC / Nombre */}
                                                <td style={{ width: colWidths.rfcNombre }} className="px-3 py-4 whitespace-nowrap text-xs text-gray-900 font-medium overflow-hidden">
                                                    {(() => {
                                                        const isEmitted = cfdi.rfc_emisor === activeRfc;
                                                        const otherName = isEmitted ? cfdi.name_receptor : cfdi.name_emisor;
                                                        const otherRfc = isEmitted ? cfdi.rfc_receptor : cfdi.rfc_emisor;
                                                        return (
                                                            <div className="flex flex-col">
                                                                <span className="font-bold truncate" style={{ maxWidth: colWidths.rfcNombre - 24 }} title={otherName || ''}>{otherName || otherRfc}</span>
                                                                {otherName && <span className="text-gray-400 font-normal text-[10px]">{otherRfc}</span>}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                {/* Concepto */}
                                                <td style={{ width: colWidths.concepto, maxWidth: colWidths.concepto }} className="px-3 py-4 text-xs text-gray-500 truncate overflow-hidden" title={cfdi.concepto || ''}>
                                                    {cfdi.tipo === 'P' ? (
                                                        <span className="italic text-violet-500 text-[10px] font-medium">Complemento de pago</span>
                                                    ) : cfdi.tipo === 'N' ? (
                                                        <span className="italic text-teal-500 text-[10px] font-medium">Nómina</span>
                                                    ) : cfdi.concepto || '-'}
                                                </td>
                                                {/* Total — para tipo P muestra el monto real del pago */}
                                                <td style={{ width: colWidths.total }} className="px-3 py-4 whitespace-nowrap text-right overflow-hidden">
                                                    {cfdi.tipo === 'P' ? (
                                                        cfdi.pagos_propios_sum_monto_pagado ? (
                                                            <span className="text-sm font-black text-violet-700">
                                                                ${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(cfdi.pagos_propios_sum_monto_pagado))}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-violet-400 italic font-medium">REP</span>
                                                        )
                                                    ) : (
                                                        <span className="text-sm font-black text-gray-900">
                                                            ${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.total)}
                                                        </span>
                                                    )}
                                                </td>
                                                {/* IVA — para tipo P muestra la fecha de pago */}
                                                <td style={{ width: colWidths.iva }} className="px-3 py-4 whitespace-nowrap text-xs text-right overflow-hidden">
                                                    {cfdi.tipo === 'P' ? (
                                                        cfdi.pagos_propios_min_fecha_pago ? (
                                                            <span className="text-[10px] font-semibold text-violet-500">
                                                                {cfdi.pagos_propios_min_fecha_pago.substring(0, 10)}
                                                            </span>
                                                        ) : <span className="text-gray-300">—</span>
                                                    ) : cfdi.iva ? (
                                                        <span className="text-gray-500">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.iva)}</span>
                                                    ) : <span className="text-gray-300">—</span>}
                                                </td>
                                                {hasRetenciones && (
                                                    <td style={{ width: colWidths.ret }} className="px-3 py-4 whitespace-nowrap text-xs text-right text-gray-500 overflow-hidden">
                                                        {cfdi.retenciones && Number(cfdi.retenciones) > 0 ? `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(cfdi.retenciones)}` : <span className="text-gray-300">—</span>}
                                                    </td>
                                                )}
                                                {/* Tipo CFDI — badge con color por tipo */}
                                                <td style={{ width: colWidths.tipo }} className="px-3 py-4 whitespace-nowrap text-center overflow-hidden">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                        cfdi.tipo === 'I' ? 'bg-blue-50 text-blue-700' :
                                                        cfdi.tipo === 'E' ? 'bg-red-50 text-red-700' :
                                                        cfdi.tipo === 'P' ? 'bg-violet-100 text-violet-700' :
                                                        cfdi.tipo === 'N' ? 'bg-teal-50 text-teal-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {cfdi.tipo === 'P' ? 'REP' : cfdi.tipo}
                                                    </span>
                                                </td>
                                                {/* Método de pago */}
                                                <td style={{ width: colWidths.met }} className="px-3 py-4 whitespace-nowrap text-center overflow-hidden">
                                                    {cfdi.tipo === 'P' ? (
                                                        <span className="text-gray-300 text-xs">—</span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${cfdi.metodo_pago === 'PUE' ? 'bg-blue-50 text-blue-600' : cfdi.metodo_pago === 'PPD' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                                            {cfdi.metodo_pago || '-'}
                                                        </span>
                                                    )}
                                                </td>
                                                {/* Estatus SAT */}
                                                <td style={{ width: colWidths.estatusSat }} className="px-3 py-4 whitespace-nowrap text-center overflow-hidden">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${cfdi.estado_sat === 'Vigente' ? 'bg-emerald-100 text-emerald-700' :
                                                        cfdi.estado_sat === 'Cancelado' ? 'bg-red-100 text-red-700' :
                                                            cfdi.estado_sat === 'No Encontrado' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-gray-100 text-gray-500'
                                                        }`}>
                                                        {cfdi.estado_sat || 'Sin verificar'}
                                                    </span>
                                                </td>
                                                {/* UUID truncado — primeros 8 chars, full en tooltip */}
                                                <td style={{ width: colWidths.uuid }} className="px-3 py-4 whitespace-nowrap overflow-hidden" title={cfdi.uuid}>
                                                    <span className="text-[10px] text-gray-400 font-mono">{cfdi.uuid.substring(0, 8)}…</span>
                                                </td>
                                                {/* Botones de acción — visibles al hover de la fila */}
                                                <td style={{ width: 96, minWidth: 96 }} className="px-2 py-4 whitespace-nowrap text-right overflow-hidden">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {/* Ojo: preview PDF inline */}
                                                        <button
                                                            title="Ver PDF"
                                                            onClick={e => { e.stopPropagation(); handlePreviewPdf(cfdi.uuid, (() => { const isE = cfdi.rfc_emisor === activeRfc; return (isE ? cfdi.name_receptor : cfdi.name_emisor) || cfdi.uuid; })()); }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-base">visibility</span>
                                                        </button>
                                                        {/* Descarga XML */}
                                                        <button
                                                            title="Descargar XML"
                                                            onClick={e => { e.stopPropagation(); exportCfdiXml(cfdi.uuid); }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-base">code</span>
                                                        </button>
                                                        {/* Abrir panel lateral */}
                                                        <button
                                                            title="Abrir detalle"
                                                            onClick={e => { e.stopPropagation(); setSelectedUuid(cfdi.uuid); }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-base">side_navigation</span>
                                                        </button>
                                                    </div>
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
                                        <span className="text-[10px] font-bold text-gray-700">{(page - 1) * 10 + 1}-{Math.min(page * 10, totalCount)}</span>
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
                                    <h3 className="font-semibold text-gray-800 uppercase text-xs tracking-widest">
                                        {selectedCfdi?.tipo === 'P' ? 'Complemento de Pago' :
                                         selectedCfdi?.tipo === 'N' ? 'Recibo de Nómina' :
                                         selectedCfdi?.tipo === 'E' ? 'Nota de Crédito / Egreso' :
                                         'Detalle de CFDI'}
                                    </h3>
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
                                            {/* ── HEADER COMÚN ── */}
                                            <div className="space-y-1.5">
                                                {/* Tipo badge */}
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                                        selectedCfdi.tipo === 'P' ? 'bg-violet-100 text-violet-700 border border-violet-200' :
                                                        selectedCfdi.tipo === 'N' ? 'bg-teal-50 text-teal-700 border border-teal-100' :
                                                        selectedCfdi.tipo === 'I' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                                        selectedCfdi.tipo === 'E' ? 'bg-red-50 text-red-700 border border-red-100' :
                                                        'bg-gray-100 text-gray-600 border border-gray-200'
                                                    }`}>
                                                        {selectedCfdi.tipo === 'P' ? 'Complemento de Pago (REP)' :
                                                         selectedCfdi.tipo === 'I' ? 'Ingreso' :
                                                         selectedCfdi.tipo === 'E' ? 'Egreso / Nota de Crédito' :
                                                         selectedCfdi.tipo === 'N' ? 'Nómina' :
                                                         selectedCfdi.tipo === 'T' ? 'Traslado' : selectedCfdi.tipo}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${selectedCfdi.estado_sat === 'Vigente' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : selectedCfdi.estado_sat === 'Cancelado' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                        {selectedCfdi.estado_sat || 'Sin verificar'}
                                                    </span>
                                                    <div className="flex-1" />
                                                    <button onClick={handleRefreshStatus} disabled={satStatusUpdating} className="p-1.5 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors border border-gray-100" title="Verificar en SAT">
                                                        <span className={`material-symbols-outlined text-sm ${satStatusUpdating ? 'animate-spin' : ''}`}>sync</span>
                                                    </button>
                                                </div>
                                                <h4 className="font-black text-gray-900 text-base leading-tight">
                                                    {(() => {
                                                        const isEmitted = selectedCfdi.rfc_emisor === activeRfc;
                                                        return isEmitted ? selectedCfdi.name_receptor : selectedCfdi.name_emisor;
                                                    })() || 'Razón Social no disponible'}
                                                </h4>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        {(() => { const isE = selectedCfdi.rfc_emisor === activeRfc; return isE ? selectedCfdi.rfc_receptor : selectedCfdi.rfc_emisor; })()}
                                                    </span>
                                                    <span className="text-[9px] font-medium text-gray-300 font-mono break-all">{selectedCfdi.uuid}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-500">
                                                    <span className="font-bold">Emisión:</span> {selectedCfdi.fecha?.substring(0, 10)}
                                                    {selectedCfdi.serie && <><span className="mx-2 text-gray-300">|</span><span className="font-bold">S/F:</span> {selectedCfdi.serie}{selectedCfdi.folio}</>}
                                                </p>
                                            </div>

                                            {/* ── BOTONES DE ACCIÓN (comunes) ── */}
                                            <div className="grid grid-cols-4 gap-2">
                                                <button onClick={() => handlePreviewPdf(selectedCfdi.uuid, (() => { const isE = selectedCfdi.rfc_emisor === activeRfc; return (isE ? selectedCfdi.name_receptor : selectedCfdi.name_emisor) || selectedCfdi.uuid; })())} className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-red-50 hover:border-red-100 group transition-all">
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-red-500 text-lg">visibility</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-red-600 uppercase mt-1">Ver</span>
                                                </button>
                                                <button onClick={() => exportCfdiPdf(selectedCfdi.uuid)} className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-orange-50 hover:border-orange-100 group transition-all">
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-orange-500 text-lg">picture_as_pdf</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-orange-600 uppercase mt-1">PDF</span>
                                                </button>
                                                <button onClick={() => exportCfdiXml(selectedCfdi.uuid)} className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-blue-50 hover:border-blue-100 group transition-all">
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-blue-500 text-lg">code</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-blue-600 uppercase mt-1">XML</span>
                                                </button>
                                                <button onClick={() => exportCfdiZip(selectedCfdi.uuid)} className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 group transition-all">
                                                    <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 text-lg">inventory_2</span>
                                                    <span className="text-[8px] font-bold text-gray-400 group-hover:text-gray-600 uppercase mt-1">ZIP</span>
                                                </button>
                                            </div>

                                            {/* ══ TIPO P — COMPLEMENTO DE PAGO ══ */}
                                            {selectedCfdi.tipo === 'P' && (
                                                <>
                                                    <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="material-symbols-outlined text-violet-500 text-base">payments</span>
                                                            <h5 className="text-[10px] font-black text-violet-700 uppercase tracking-widest">Complemento de Pago</h5>
                                                        </div>
                                                        <p className="text-[10px] text-violet-600 leading-relaxed">
                                                            Este CFDI es un <strong>Recibo Electrónico de Pago (REP)</strong>. Los montos reales están en el complemento Pagos 2.0 dentro del XML — el total del encabezado es $1.00 por diseño del SAT.
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-3 pt-1">
                                                            <div>
                                                                <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest block">Emisor (quien paga)</span>
                                                                <p className="text-[10px] font-bold text-gray-700 truncate">{selectedCfdi.name_emisor || selectedCfdi.rfc_emisor}</p>
                                                                <p className="text-[9px] text-gray-400 font-mono">{selectedCfdi.rfc_emisor}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[8px] font-bold text-violet-400 uppercase tracking-widest block">Receptor (cobrador)</span>
                                                                <p className="text-[10px] font-bold text-gray-700 truncate">{selectedCfdi.name_receptor || selectedCfdi.rfc_receptor}</p>
                                                                <p className="text-[9px] text-gray-400 font-mono">{selectedCfdi.rfc_receptor}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Pagos detallados */}
                                                    {selectedCfdi.pagos_propios && selectedCfdi.pagos_propios.length > 0 ? (
                                                        <div className="space-y-2">
                                                            <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Pagos registrados ({selectedCfdi.pagos_propios.length})</p>
                                                            {selectedCfdi.pagos_propios.map((p, i) => (
                                                                <div key={i} className="bg-white border border-violet-100 rounded-xl p-3 space-y-2">
                                                                    <div className="flex justify-between items-start">
                                                                        <div>
                                                                            <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">Fecha de pago</p>
                                                                            <p className="text-sm font-black text-violet-800">{p.fecha_pago?.toString().substring(0, 10)}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">Monto pagado</p>
                                                                            <p className="text-lg font-black text-violet-900">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(p.monto_pagado))}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-violet-50">
                                                                        {p.num_parcialidad && (
                                                                            <div>
                                                                                <p className="text-[8px] text-violet-300 font-bold uppercase">Parcialidad</p>
                                                                                <p className="text-[10px] font-black text-gray-600">{p.num_parcialidad}</p>
                                                                            </div>
                                                                        )}
                                                                        {p.saldo_anterior && Number(p.saldo_anterior) > 0 && (
                                                                            <div>
                                                                                <p className="text-[8px] text-violet-300 font-bold uppercase">Saldo ant.</p>
                                                                                <p className="text-[10px] font-black text-gray-600">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(p.saldo_anterior))}</p>
                                                                            </div>
                                                                        )}
                                                                        {p.saldo_insoluto !== undefined && (
                                                                            <div>
                                                                                <p className="text-[8px] text-violet-300 font-bold uppercase">Saldo pend.</p>
                                                                                <p className={`text-[10px] font-black ${Number(p.saldo_insoluto) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                                    {Number(p.saldo_insoluto) === 0 ? 'Liquidado' : `$${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(p.saldo_insoluto))}`}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[9px] text-gray-400 font-mono truncate" title={p.uuid_relacionado}>
                                                                        Doc. rel: {p.uuid_relacionado.substring(0, 8)}…
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4 space-y-2 text-xs">
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Datos del CFDI</p>
                                                            <div className="flex justify-between"><span className="text-gray-400 font-medium">Fecha de emisión</span><span className="font-bold text-gray-700">{selectedCfdi.fecha?.substring(0, 10)}</span></div>
                                                            <div className="flex justify-between"><span className="text-gray-400 font-medium">Moneda</span><span className="font-bold text-gray-700">{selectedCfdi.moneda || 'MXN'}</span></div>
                                                            <p className="text-[9px] text-violet-500 font-bold pt-1">Sin pagos registrados aún. Descarga el XML para ver el complemento completo.</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* ══ TIPO N — NÓMINA ══ */}
                                            {selectedCfdi.tipo === 'N' && (
                                                <>
                                                    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 space-y-3">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="material-symbols-outlined text-teal-500 text-base">badge</span>
                                                            <h5 className="text-[10px] font-black text-teal-700 uppercase tracking-widest">Recibo de Nómina</h5>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <span className="text-[8px] font-bold text-teal-400 uppercase tracking-widest block">Empleador</span>
                                                                <p className="text-[10px] font-bold text-gray-700 truncate">{selectedCfdi.name_emisor || selectedCfdi.rfc_emisor}</p>
                                                                <p className="text-[9px] text-gray-400 font-mono">{selectedCfdi.rfc_emisor}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[8px] font-bold text-teal-400 uppercase tracking-widest block">Empleado</span>
                                                                <p className="text-[10px] font-bold text-gray-700 truncate">{selectedCfdi.name_receptor || selectedCfdi.rfc_receptor}</p>
                                                                <p className="text-[9px] text-gray-400 font-mono">{selectedCfdi.rfc_receptor}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Financials para nómina */}
                                                    <div className="bg-gray-50/50 rounded-2xl p-4 space-y-3">
                                                        {Number(selectedCfdi.subtotal) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-gray-400 font-bold uppercase tracking-wider">Percepciones</span>
                                                                <span className="font-black text-gray-700">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.subtotal))}</span>
                                                            </div>
                                                        )}
                                                        {Number(selectedCfdi.retenciones) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-red-400 font-bold uppercase tracking-wider">Retenciones/ISR</span>
                                                                <span className="font-black text-red-600">-${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.retenciones))}</span>
                                                            </div>
                                                        )}
                                                        <div className="h-px bg-gray-100" />
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Neto a pagar</span>
                                                            <span className="text-lg font-black text-gray-900">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.total))}</span>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {/* ══ TIPOS I / E / T — FACTURAS NORMALES ══ */}
                                            {(selectedCfdi.tipo === 'I' || selectedCfdi.tipo === 'E' || selectedCfdi.tipo === 'T' || !selectedCfdi.tipo) && (
                                                <>
                                                    {/* Método pago */}
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${selectedCfdi.metodo_pago === 'PUE' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                                            {selectedCfdi.metodo_pago || '—'}
                                                        </span>
                                                        {selectedCfdi.forma_pago && (
                                                            <span className="text-[10px] text-gray-500 font-medium">Forma: <b>{selectedCfdi.forma_pago}</b></span>
                                                        )}
                                                        {selectedCfdi.uso_cfdi && (
                                                            <span className="text-[10px] text-gray-400">Uso: <b>{selectedCfdi.uso_cfdi}</b></span>
                                                        )}
                                                    </div>

                                                    {/* Financials */}
                                                    <div className="bg-gray-50/50 rounded-2xl p-4 space-y-3">
                                                        {Number(selectedCfdi.subtotal) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-gray-400 font-bold uppercase tracking-wider">Subtotal</span>
                                                                <span className="text-gray-600 font-black">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.subtotal))}</span>
                                                            </div>
                                                        )}
                                                        {selectedCfdi.descuento && Number(selectedCfdi.descuento) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-gray-400 font-bold uppercase tracking-wider">Descuento</span>
                                                                <span className="text-gray-600 font-black">-${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.descuento))}</span>
                                                            </div>
                                                        )}
                                                        {Number(selectedCfdi.iva) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-gray-400 font-bold uppercase tracking-wider">IVA (16%)</span>
                                                                <span className="text-gray-600 font-black">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.iva))}</span>
                                                            </div>
                                                        )}
                                                        {selectedCfdi.retenciones && Number(selectedCfdi.retenciones) > 0 && (
                                                            <div className="flex justify-between items-center text-xs">
                                                                <span className="text-red-400 font-bold uppercase tracking-wider">Retenciones</span>
                                                                <span className="text-red-600 font-black">-${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.retenciones))}</span>
                                                            </div>
                                                        )}
                                                        <div className="h-px bg-gray-200 my-1"></div>
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-gray-900 font-black uppercase tracking-widest">Total</span>
                                                                <span className="text-[8px] font-bold text-gray-400">{selectedCfdi.moneda || 'MXN'}{selectedCfdi.tipo_cambio && selectedCfdi.tipo_cambio > 1 ? ` · TC: ${selectedCfdi.tipo_cambio}` : ''}</span>
                                                            </div>
                                                            <span className="text-xl text-gray-900 font-black tracking-tight">${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(selectedCfdi.total))}</span>
                                                        </div>
                                                    </div>

                                                    {/* Concepto */}
                                                    {selectedCfdi.concepto && (
                                                        <div className="bg-white border border-gray-100 rounded-2xl p-4">
                                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Concepto</span>
                                                            <p className="text-xs text-gray-700 leading-relaxed">{selectedCfdi.concepto}</p>
                                                        </div>
                                                    )}

                                                    {/* Clasificación Contable */}
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
                                                </>
                                            )}

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

                    {/* PDF Inline Preview Modal */}
                    {(pdfPreviewLoading || pdfPreviewUrl) && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClosePdfPreview}></div>
                            <div className="relative w-full max-w-4xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0">picture_as_pdf</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{pdfPreviewTitle}</p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Vista previa del CFDI</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleClosePdfPreview}
                                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all flex-shrink-0"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    {pdfPreviewLoading && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                                            <div className="w-10 h-10 border-4 border-gray-100 border-t-red-500 rounded-full animate-spin"></div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cargando PDF...</p>
                                        </div>
                                    )}
                                    {pdfPreviewUrl && (
                                        <iframe
                                            src={pdfPreviewUrl}
                                            className="w-full h-full border-0"
                                            title="Vista previa CFDI"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

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
            {/* Export Excel Modal */}
            {showExportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm shadow-2xl" onClick={() => setShowExportModal(false)}></div>
                    <div className="relative bg-white w-full max-w-xl max-h-[90vh] flex flex-col rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Exportar a Excel</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Personaliza tu reporte</p>
                            </div>
                            <button onClick={() => setShowExportModal(false)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all">
                                <span className="material-symbols-outlined text-gray-400">close</span>
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar bg-white flex-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 block">Selecciona las columnas:</p>
                            <div className="grid grid-cols-2 gap-3">
                                {allColumns.map(col => (
                                    <label key={col.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer ${exportColumns.includes(col.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${exportColumns.includes(col.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                                            {exportColumns.includes(col.id) && <span className="material-symbols-outlined text-white text-[10px] font-bold">check</span>}
                                        </div>
                                        <span className={`text-xs font-bold uppercase tracking-tight ${exportColumns.includes(col.id) ? 'text-blue-700' : 'text-gray-500'}`}>{col.label}</span>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={exportColumns.includes(col.id)}
                                            onChange={e => {
                                                if (e.target.checked) {
                                                    setExportColumns([...exportColumns, col.id]);
                                                } else {
                                                    setExportColumns(exportColumns.filter(c => c !== col.id));
                                                }
                                            }}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 bg-gray-50 border-t border-gray-100 flex-shrink-0">
                            <button
                                onClick={() => {
                                    exportCfdisExcel({
                                        rfc_user: activeRfc,
                                        year,
                                        month,
                                        tipo: (filterType === 'all' || filterType === 'canceladas') ? undefined : filterType,
                                        status: filterType === 'canceladas' ? 'cancelados' : (showCancelled ? undefined : 'activos'),
                                        cfdi_tipo: filterType === 'canceladas' ? undefined : cfdiTipo,
                                        q: search
                                    }, exportColumns);
                                    setShowExportModal(false);
                                }}
                                className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-black rounded-2xl transition-all text-sm uppercase tracking-widest shadow-xl shadow-gray-200 flex items-center justify-center gap-3"
                            >
                                <span className="material-symbols-outlined">download</span>
                                Descargar Reporte
                            </button>
                        </div>
                    </div>
                </div>
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

            {/* Modal for Upload Results */}
            {uploadResult && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Resultado de Carga</h3>
                                <p className="text-xs text-gray-500 mt-1">Detalles de los archivos subidos.</p>
                            </div>
                            <button onClick={() => setUploadResult(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto max-h-[60vh] space-y-4">
                            {!uploadResult.details ? (
                                <div className="text-red-500 text-center">{uploadResult.message || 'Error desconocido'}</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-center">
                                            <div className="text-3xl font-black">{uploadResult.success}</div>
                                            <div className="text-xs font-bold uppercase tracking-wider">Aprobados</div>
                                        </div>
                                        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-center">
                                            <div className="text-3xl font-black">{uploadResult.failed}</div>
                                            <div className="text-xs font-bold uppercase tracking-wider">Fallidos</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-widest border-b pb-2 mb-2">Desglose de Archivos</h4>
                                        {uploadResult.details.map((dt: any, idx: number) => {
                                            let bgClasses = 'bg-red-50/50 border-red-500 text-red-900';
                                            let textClasses = 'text-red-600';
                                            let title = 'ERROR';

                                            if (dt.status === 'success') {
                                                bgClasses = 'bg-emerald-50/50 border-emerald-500 text-emerald-900';
                                                textClasses = 'text-emerald-700';
                                                title = 'ÉXITO';
                                            } else if (dt.status === 'warning') {
                                                bgClasses = 'bg-amber-50/50 border-amber-500 text-amber-900';
                                                textClasses = 'text-amber-700';
                                                title = 'REDIRIGIDO';
                                            }

                                            return (
                                                <div key={idx} className={`p-3 rounded-lg text-xs flex flex-col gap-1 border-l-4 ${bgClasses}`}>
                                                    <div className="font-bold flex items-center justify-between mt-1">
                                                        <span className="truncate pr-2">{dt.file}</span>
                                                        <span>{title}</span>
                                                    </div>
                                                    <div className={`opacity-80 mt-1 ${textClasses}`}>
                                                        {dt.message}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setUploadResult(null)}
                                className="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all shadow-lg"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Request Modal */}
            {showManualRequestModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Solicitud Manual SAT</h3>
                                <p className="text-xs text-gray-500 font-medium">Define el rango de fechas para {activeRfc}</p>
                            </div>
                            <button
                                onClick={() => setShowManualRequestModal(false)}
                                className="p-2 hover:bg-white rounded-xl text-gray-400 hover:text-gray-600 transition-all border border-transparent hover:border-gray-100"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleManualRequestSubmit} className="p-8 space-y-6">
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
                                disabled={isSubmittingManual}
                                className="w-full py-5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 group shadow-lg shadow-gray-200"
                            >
                                {isSubmittingManual ? (
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
};
