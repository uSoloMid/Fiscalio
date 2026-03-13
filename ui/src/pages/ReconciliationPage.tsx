import { useState, useEffect } from 'react';
import { listBankStatements, getReconciliationSuggestions, reconcileMovement, authFetch } from '../services';
import { API_BASE_URL } from '../api/config';
import { MovementReconcileRow } from '../components/MovementReconcileRow';
import { ReconciliationSidebar } from '../components/ReconciliationSidebar';
import type { BankStatement, BankMovement, ReconciliationStats } from '../models';

interface Props {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const BANK_COLORS: Record<string, string> = {
    bbva: 'bg-blue-600',
    banamex: 'bg-red-600',
    santander: 'bg-red-500',
    hsbc: 'bg-red-800',
    banorte: 'bg-orange-600',
    inbursa: 'bg-blue-800',
    banbajío: 'bg-emerald-700',
    scotiabank: 'bg-yellow-600',
};
const getBankColor = (name: string) => {
    const lower = name.toLowerCase();
    for (const [key, color] of Object.entries(BANK_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return 'bg-gray-500';
};

export function ReconciliationPage({ activeRfc, clientName, onBack }: Props) {
    const [statements, setStatements] = useState<BankStatement[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [reconciliationData, setReconciliationData] = useState<{ movements: BankMovement[]; stats: ReconciliationStats } | null>(null);
    const [isLoadingStatements, setIsLoadingStatements] = useState(true);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isBulkConfirming, setIsBulkConfirming] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(true);
    const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'reconciled'>('all');
    const [colWidths, setColWidths] = useState([90, 280, 120, 120, 60, 100, 240, 140, 64]);

    // PDF Viewer state
    const [viewingUuid, setViewingUuid] = useState<string | null>(null);
    const [viewBlobUrl, setViewBlobUrl] = useState<string | null>(null);
    const [viewingTitle, setViewingTitle] = useState<string>('');

    // Added filters to match BankStatementPage and persist
    const [bankFilter, setBankFilter] = useState(() => localStorage.getItem('bank_filter') || 'all');
    const [yearFilter, setYearFilter] = useState(() => localStorage.getItem('year_filter') || String(new Date().getFullYear()));
    const [monthFilter, setMonthFilter] = useState(() => localStorage.getItem('month_filter') || ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][new Date().getMonth()]);

    useEffect(() => {
        localStorage.setItem('bank_filter', bankFilter);
    }, [bankFilter]);

    useEffect(() => {
        localStorage.setItem('year_filter', yearFilter);
    }, [yearFilter]);

    useEffect(() => {
        localStorage.setItem('month_filter', monthFilter);
    }, [monthFilter]);

    const gridTemplate = colWidths.map(w => `${w}px`).join(' ');

    const startResize = (colIdx: number, e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colWidths[colIdx];
        const onMove = (ev: MouseEvent) => {
            setColWidths(prev => {
                const next = [...prev];
                next[colIdx] = Math.max(60, startW + (ev.clientX - startX));
                return next;
            });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const COL_HEADERS = ['FECHA', 'DESCRIPCIÓN', 'CARGO (-)', 'ABONO (+)', 'TIPO', 'FORMA PAGO', 'RFC / PROVEEDOR', 'ESTADO', ''];

    useEffect(() => {
        loadStatements();
    }, [activeRfc]);

    const loadStatements = async () => {
        setIsLoadingStatements(true);
        try {
            const data = await listBankStatements(activeRfc);
            setStatements(data || []);
        } catch (e) {
            console.error("Error loading statements", e);
            setStatements([]);
        } finally {
            setIsLoadingStatements(false);
        }
    };

    const handleSelectStatement = async (id: number) => {
        if (selectedId === id) { setIsSelectorOpen(false); return; }
        setSelectedId(id);
        setSelectedMovement(null);
        setReconciliationData(null);
        setIsSelectorOpen(false);
        setIsLoadingSuggestions(true);
        try {
            const data = await getReconciliationSuggestions(id, activeRfc);
            setReconciliationData(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingSuggestions(false);
        }
    };

    const adjustReconciledCount = (delta: number) => {
        if (!selectedId) return;
        setStatements(prev => prev.map(s =>
            s.id === selectedId
                ? { ...s, reconciled_count: Math.max(0, ((s as any).reconciled_count ?? 0) + delta) }
                : s
        ));
    };

    const handleMovementReconciled = (updated: BankMovement) => {
        setSelectedMovement(null);
        setReconciliationData(prev => {
            if (!prev) return prev;
            const wasReconciled = prev.movements.find(m => m.id === updated.id)?.cfdi_id;
            if (!wasReconciled) adjustReconciledCount(+1);
            const movements = prev.movements.map(m => m.id === updated.id ? { ...updated, suggestions: [] } : m);
            return { movements, stats: computeStats(movements) };
        });
    };

    const handleMovementUnreconciled = (movementId: number) => {
        adjustReconciledCount(-1);
        setReconciliationData(prev => {
            if (!prev) return prev;
            const movements = prev.movements.map(m =>
                m.id === movementId
                    ? { ...m, cfdi_id: null, confidence: null, reconciled_at: null, is_reviewed: false, cfdi: null }
                    : m
            );
            return { movements, stats: computeStats(movements) };
        });
    };

    const handleViewPdf = async (uuid: string, title: string) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}/pdf?inline=1`);
            if (!response.ok) throw new Error('Error al cargar PDF');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            if (viewBlobUrl) URL.revokeObjectURL(viewBlobUrl);
            setViewBlobUrl(url);
            setViewingUuid(uuid);
            setViewingTitle(title);
        } catch (e) {
            alert('No se pudo abrir el PDF');
        }
    };

    const handleDownloadPdf = async (uuid: string) => {
        try {
            const response = await authFetch(`${API_BASE_URL}/api/cfdis/${uuid}/pdf`);
            if (!response.ok) throw new Error('Error');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CFDI_${uuid}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            alert('Error al descargar PDF');
        }
    };

    const handleCloseViewer = () => {
        setViewingUuid(null);
        if (viewBlobUrl) { URL.revokeObjectURL(viewBlobUrl); setViewBlobUrl(null); }
    };

    const handleSelectMovement = (movement: BankMovement) => {
        setSelectedMovement(prev => prev?.id === movement.id ? null : movement);
    };

    const handleBulkConfirmGreen = async () => {
        if (!reconciliationData || !selectedId) return;
        const greenPending = reconciliationData.movements.filter(
            m => !m.cfdi_id && m.suggestions && m.suggestions.length > 0 && m.suggestions[0].confidence === 'green'
        );
        if (greenPending.length === 0) return;
        setIsBulkConfirming(true);
        try {
            const updatedMovements = [...reconciliationData.movements];
            for (const movement of greenPending) {
                const top = movement.suggestions![0];
                const res = await reconcileMovement(movement.id, top.cfdi_id, 'green');
                const idx = updatedMovements.findIndex(m => m.id === movement.id);
                if (idx !== -1) updatedMovements[idx] = { ...res.movement, suggestions: [] };
            }
            if (selectedMovement && greenPending.find(m => m.id === selectedMovement.id)) {
                setSelectedMovement(null);
            }
            setReconciliationData({ movements: updatedMovements, stats: computeStats(updatedMovements) });
            adjustReconciledCount(greenPending.length);
        } finally {
            setIsBulkConfirming(false);
        }
    };

    const computeStats = (movements: BankMovement[]): ReconciliationStats => {
        const stats: ReconciliationStats = { total: movements.length, green: 0, yellow: 0, red: 0, unmatched: 0 };
        movements.forEach(m => {
            if (m.cfdi_id) {
                const c = m.confidence ?? 'green';
                if (c in stats) (stats as any)[c]++;
            } else if ((m.suggestions?.length ?? 0) === 0) {
                stats.unmatched++;
            } else {
                const top = m._confidence_preview ?? m.suggestions![0]?.confidence;
                if (top && top in stats) (stats as any)[top]++;
                else stats.unmatched++;
            }
        });
        return stats;
    };

    const filteredStatements = statements.filter(s => {
        const matchesBank = bankFilter === 'all' || s.bank_name.toLowerCase() === bankFilter.toLowerCase();
        const matchesYear = yearFilter === 'all' || (s.period && s.period.includes(yearFilter));
        const matchesMonth = monthFilter === 'all' || (s.period && s.period.split('-')[0] === monthFilter);
        return matchesBank && matchesYear && matchesMonth;
    });

    const monthsOrder = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const uniqueBanks = Array.from(new Set(statements.map(s => s.bank_name)));
    const uniqueYears = Array.from(new Set(statements.map(s => s.period?.split('-')[1]).filter(y => y))).sort();
    const uniqueMonths = Array.from(new Set(statements.map(s => s.period?.split('-')[0]).filter(m => m)))
        .sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b));

    const selectedStatement = statements.find(s => s.id === selectedId);
    const greenPendingCount = reconciliationData?.movements.filter(
        m => !m.cfdi_id && m.suggestions?.[0]?.confidence === 'green'
    ).length ?? 0;

    const allMovements = reconciliationData?.movements ?? [];
    const totalCount = allMovements.length;
    const reconciledCount = allMovements.filter(m => !!m.cfdi_id).length;
    const pendingCount = totalCount - reconciledCount;
    const progressPct = totalCount > 0 ? Math.round((reconciledCount / totalCount) * 100) : 0;

    const filteredMovements = allMovements.filter(m => {
        if (filter === 'pending') return !m.cfdi_id;
        if (filter === 'reconciled') return !!m.cfdi_id;
        return true;
    });

    // Bank card status
    const getStatementStatus = (s: BankStatement) => {
        const total = (s as any).movements_count ?? 0;
        const reconciled = (s as any).reconciled_count ?? 0;
        const pct = total > 0 ? Math.round((reconciled / total) * 100) : 0;
        if (pct >= 80) return { label: 'Conciliado', color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' };
        if (pct > 0) return { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-50', dot: 'bg-yellow-400' };
        return { label: 'Sin Iniciar', color: 'text-gray-400 bg-gray-50', dot: 'bg-gray-300' };
    };

    return (
        <div className="flex flex-col h-screen bg-[#F8FAFC] font-['Inter'] overflow-hidden">

            {/* ── Bank selector ── */}
            {isSelectorOpen ? (
                /* Expanded */
                <div className="bg-white border-b border-gray-100 px-8 py-6 flex-shrink-0 min-h-[300px]">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <button
                                onClick={onBack}
                                className="flex items-center gap-2 text-gray-400 hover:text-gray-700 transition-colors mb-3"
                            >
                                <span className="material-symbols-outlined text-lg">arrow_back</span>
                                <span className="text-xs font-black uppercase tracking-widest">Volver</span>
                            </button>
                            <h1 className="text-xl font-black text-gray-900">Conciliación Bancaria</h1>
                            <p className="text-xs font-bold text-gray-400 mt-0.5 uppercase tracking-widest">{clientName}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <select
                                value={bankFilter}
                                onChange={e => setBankFilter(e.target.value)}
                                className="text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                            >
                                <option value="all">Bancos</option>
                                {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <select
                                value={monthFilter}
                                onChange={e => setMonthFilter(e.target.value)}
                                className="text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                            >
                                <option value="all">Mes</option>
                                {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select
                                value={yearFilter}
                                onChange={e => setYearFilter(e.target.value)}
                                className="text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                            >
                                <option value="all">Año</option>
                                {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    {isLoadingStatements ? (
                        <div className="flex items-center gap-3 py-6">
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Cargando estados…</span>
                        </div>
                    ) : statements.length === 0 ? (
                        <div className="py-8 text-center">
                            <span className="material-symbols-outlined text-4xl text-gray-200 block mb-2">account_balance</span>
                            <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Sin estados de cuenta registrados</p>
                            <p className="text-xs text-gray-400 mt-1">Sube un PDF bancario en el módulo de Bancos primero</p>
                        </div>
                    ) : filteredStatements.length === 0 ? (
                        <div className="py-8 text-center">
                            <span className="material-symbols-outlined text-4xl text-gray-200 block mb-2">filter_list_off</span>
                            <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Sin resultados con estos filtros</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {filteredStatements.map(s => {
                                const total = (s as any).movements_count ?? 0;
                                const reconciled = (s as any).reconciled_count ?? 0;
                                const pct = total > 0 ? Math.round((reconciled / total) * 100) : 0;
                                const status = getStatementStatus(s);
                                const bankColor = getBankColor(s.bank_name);
                                const bankInitial = s.bank_name.charAt(0).toUpperCase();
                                const lastFour = s.account_number ? s.account_number.slice(-4) : '—';

                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => handleSelectStatement(s.id)}
                                        className={`text-left p-4 rounded-2xl border-2 transition-all hover:shadow-md ${s.id === selectedId
                                            ? 'border-emerald-500 shadow-sm shadow-emerald-100'
                                            : 'border-gray-100 hover:border-gray-200 bg-white'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-9 h-9 rounded-xl ${bankColor} flex items-center justify-center text-white text-sm font-black flex-shrink-0`}>
                                                {bankInitial}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-gray-900 truncate">{s.bank_name}</p>
                                                <p className="text-[10px] font-medium text-gray-400">CTA *{lastFour}</p>
                                            </div>
                                            {s.id === selectedId && (
                                                <span className="material-symbols-outlined text-emerald-500 text-base ml-auto flex-shrink-0">check_circle</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{s.period}</p>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Saldo Final</p>
                                        <p className="text-base font-black text-gray-900 mt-0.5">{fmt(parseFloat(s.final_balance as any))}</p>
                                        <div className="flex items-center justify-between mt-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${status.color}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                                {status.label}
                                            </span>
                                            <span className="text-[10px] font-black text-gray-400">{pct}%</span>
                                        </div>
                                        <div className="w-full h-1 rounded-full bg-gray-100 mt-1.5">
                                            <div
                                                className="h-1 rounded-full bg-emerald-500 transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                /* Compact bar */
                <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">arrow_back</span>
                    </button>

                    <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                    {selectedStatement && (
                        <>
                            <div className={`w-7 h-7 rounded-lg ${getBankColor(selectedStatement.bank_name)} flex items-center justify-center text-white text-xs font-black flex-shrink-0`}>
                                {selectedStatement.bank_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-black text-gray-900 truncate">{selectedStatement.bank_name}</span>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">—</span>
                                <span className="text-xs font-bold text-gray-500">{selectedStatement.period}</span>
                            </div>
                        </>
                    )}

                    <button
                        onClick={() => setIsSelectorOpen(true)}
                        className="ml-2 px-3 py-1.5 rounded-xl border border-gray-200 text-[11px] font-black text-gray-500 hover:bg-gray-50 transition-all uppercase tracking-widest flex-shrink-0"
                    >
                        Cambiar
                    </button>

                    <div className="flex-1" />

                    {/* Stats chips */}
                    {reconciliationData && (
                        <div className="flex items-center gap-3">
                            {[
                                { key: 'green', label: 'Auto', color: 'text-emerald-600' },
                                { key: 'yellow', label: 'Revisar', color: 'text-yellow-600' },
                                { key: 'red', label: 'Manual', color: 'text-red-500' },
                                { key: 'unmatched', label: 'Pendiente', color: 'text-gray-400' },
                            ].map(({ key, label, color }) => (
                                <span key={key} className={`text-[9px] font-black uppercase tracking-widest ${color}`}>
                                    {(reconciliationData.stats as any)[key]} {label}
                                </span>
                            ))}
                        </div>
                    )}

                    {greenPendingCount > 0 && (
                        <button
                            onClick={handleBulkConfirmGreen}
                            disabled={isBulkConfirming}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-60 shadow-sm shadow-emerald-100 flex-shrink-0"
                        >
                            {isBulkConfirming
                                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <span className="material-symbols-outlined text-sm">auto_awesome</span>
                            }
                            Conciliar {greenPendingCount} automáticos
                        </button>
                    )}
                </div>
            )}

            {/* ── Main content: table + sidebar ── */}
            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                    {isSelectorOpen || !selectedId ? (
                        !isSelectorOpen && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                <span className="material-symbols-outlined text-6xl text-gray-200">balance</span>
                                <p className="text-sm font-black text-gray-300 uppercase tracking-[0.3em]">Selecciona un estado de cuenta</p>
                            </div>
                        )
                    ) : (
                        <>
                            {/* Progress bar */}
                            {reconciliationData && (
                                <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-2 bg-emerald-500 rounded-full transition-all duration-500"
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                    <span className="text-xs font-black text-gray-500 whitespace-nowrap tabular-nums">
                                        {reconciledCount} / {totalCount}
                                    </span>
                                    <span className={`text-xs font-black whitespace-nowrap ${progressPct >= 80 ? 'text-emerald-600' : progressPct > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                        {progressPct}% conciliado
                                    </span>
                                </div>
                            )}

                            {/* Filter tabs */}
                            {reconciliationData && (
                                <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-1 flex-shrink-0">
                                    {([
                                        { key: 'all' as const, label: 'Todas', count: totalCount },
                                        { key: 'pending' as const, label: 'Pendientes', count: pendingCount },
                                        { key: 'reconciled' as const, label: 'Conciliadas', count: reconciledCount },
                                    ]).map(({ key, label, count }) => (
                                        <button
                                            key={key}
                                            onClick={() => setFilter(key)}
                                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${filter === key
                                                ? 'bg-gray-900 text-white'
                                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            {label}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                                                }`}>
                                                {count}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Movements list */}
                            <div className="flex-1 overflow-y-auto bg-white">
                                {isLoadingSuggestions ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Analizando coincidencias…</p>
                                    </div>
                                ) : reconciliationData ? (
                                    <>
                                        {/* Column headers — resizable */}
                                        <div
                                            style={{ gridTemplateColumns: gridTemplate }}
                                            className="grid gap-0 bg-gray-50 border-b border-gray-100 sticky top-0 z-10 select-none"
                                        >
                                            {COL_HEADERS.map((h, i) => (
                                                <div
                                                    key={`${h}-${i}`}
                                                    className="relative flex items-center px-4 py-3 border-r border-gray-200 last:border-r-0"
                                                >
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                                                    {/* Resize handle — not on last col */}
                                                    {i < COL_HEADERS.length - 1 && (
                                                        <div
                                                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize z-20 flex items-center justify-center group"
                                                            onMouseDown={(e) => startResize(i, e)}
                                                        >
                                                            <div className="w-0.5 h-4 rounded-full bg-gray-300 opacity-0 group-hover:opacity-100 group-hover:bg-blue-400 transition-all" />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {filteredMovements.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                                <span className="material-symbols-outlined text-4xl text-gray-200">inbox</span>
                                                <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Sin movimientos en este filtro</p>
                                            </div>
                                        ) : filteredMovements.map(m => (
                                            <MovementReconcileRow
                                                key={m.id}
                                                movement={m}
                                                isSelected={selectedMovement?.id === m.id}
                                                onSelect={handleSelectMovement}
                                                onUnreconciled={handleMovementUnreconciled}
                                                onViewPdf={handleViewPdf}
                                                onDownloadPdf={handleDownloadPdf}
                                                gridTemplate={gridTemplate}
                                            />
                                        ))}
                                    </>
                                ) : null}
                            </div>

                            {/* Footer summary */}
                            {selectedStatement && (
                                <div className="bg-white border-t border-gray-100 px-6 py-3 flex items-center gap-8 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inicial</span>
                                        <span className="text-xs font-black text-gray-700">{fmt(parseFloat(selectedStatement.initial_balance as any))}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Cargos</span>
                                        <span className="text-xs font-black text-red-500">-{fmt(parseFloat(selectedStatement.total_cargos as any))}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Abonos</span>
                                        <span className="text-xs font-black text-emerald-600">+{fmt(parseFloat(selectedStatement.total_abonos as any))}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Final</span>
                                        <span className="text-xs font-black text-gray-900">{fmt(parseFloat(selectedStatement.final_balance as any))}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Sidebar */}
                {selectedMovement && !isSelectorOpen && (
                    <ReconciliationSidebar
                        movement={selectedMovement}
                        onClose={() => setSelectedMovement(null)}
                        onReconciled={handleMovementReconciled}
                    />
                )}
            </div>

            {/* PDF Viewer Modal */}
            {viewingUuid && viewBlobUrl && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-red-500">picture_as_pdf</span>
                                <div>
                                    <p className="text-sm font-black text-gray-900 uppercase tracking-wide">Vista Previa CFDI</p>
                                    <p className="text-[10px] font-bold text-gray-400 truncate max-w-md">{viewingTitle || viewingUuid}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadPdf(viewingUuid!)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-xl transition-all uppercase tracking-widest shadow-sm shadow-blue-100"
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    Descargar
                                </button>
                                <button
                                    onClick={handleCloseViewer}
                                    className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>
                        <iframe
                            src={`${viewBlobUrl}#toolbar=1&view=FitH`}
                            className="flex-1 w-full"
                            title="Visor PDF"
                            style={{ border: 'none' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
