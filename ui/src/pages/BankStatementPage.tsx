import React, { useState, useEffect } from 'react';
import { processBankStatement, confirmBankStatement, listBankStatements, getBankStatement, deleteBankStatement, getReconciliationSuggestions } from '../services';
import { MovementReconcileRow } from '../components/MovementReconcileRow';
import { ReconciliationSidebar } from '../components/ReconciliationSidebar';
import type { BankMovement, ReconciliationStats } from '../models';

export const BankStatementPage = ({ activeRfc, clientName, onBack }: { activeRfc: string, clientName: string, onBack: () => void }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [activeView, setActiveView] = useState<'management' | 'detail'>('management');
    const [result, setResult] = useState<any>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [statements, setStatements] = useState<any[]>([]);
    const [bankFilter, setBankFilter] = useState('all');
    const [yearFilter, setYearFilter] = useState('all');
    const [monthFilter, setMonthFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [reconciliationMode, setReconciliationMode] = useState(false);
    const [reconciliationData, setReconciliationData] = useState<{ movements: BankMovement[]; stats: ReconciliationStats } | null>(null);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
    const [colWidths, setColWidths] = useState([90, 340, 150, 150, 180, 48]);

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

    const COL_HEADERS = ['FECHA', 'DESCRIPCIÓN', 'CARGO (-)', 'ABONO (+)', 'ESTADO', ''];

    useEffect(() => {
        loadStatements();
    }, [activeRfc]);

    const loadStatements = async () => {
        try {
            const data = await listBankStatements(activeRfc);
            setStatements(data);
        } catch (e) {
            console.error("Error loading statements", e);
        }
    };

    const handleSelectStatement = async (id: number) => {
        setIsProcessing(true);
        setReconciliationMode(false);
        setReconciliationData(null);
        try {
            const data = await getBankStatement(id, activeRfc);
            setResult({
                id: data.id,
                banco: data.bank_name,
                fileName: data.file_name,
                period: data.period,
                account_number: data.account_number,
                movements: data.movements.map((m: any) => ({
                    // Preserve DB fields for reconciliation
                    _dbId: m.id,
                    fecha: m.date,
                    concepto: m.description,
                    referencia: m.reference,
                    cargo: parseFloat(m.cargo),
                    abono: parseFloat(m.abono),
                    saldo: parseFloat(m.saldo)
                })),
                summary: {
                    initialBalance: parseFloat(data.initial_balance),
                    totalCargos: parseFloat(data.total_cargos),
                    totalAbonos: parseFloat(data.total_abonos),
                    finalBalance: parseFloat(data.final_balance)
                }
            });
            setActiveView('detail');
        } catch (e) {
            alert("Error al cargar detalle");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleReconciliation = async () => {
        if (!reconciliationMode && !reconciliationData && result?.id) {
            setIsLoadingSuggestions(true);
            try {
                const data = await getReconciliationSuggestions(result.id, activeRfc);
                setReconciliationData(data);
            } catch (e) {
                alert('Error al cargar sugerencias de conciliación');
            } finally {
                setIsLoadingSuggestions(false);
            }
        }
        setReconciliationMode(prev => !prev);
    };

    const handleMovementReconciled = (updated: BankMovement) => {
        setSelectedMovement(null);
        setReconciliationData(prev => {
            if (!prev) return prev;
            const movements = prev.movements.map(m => m.id === updated.id ? { ...updated, suggestions: [] } : m);
            const stats = computeStats(movements);
            return { ...prev, movements, stats };
        });
    };

    const handleSelectMovement = (movement: BankMovement) => {
        setSelectedMovement(prev => prev?.id === movement.id ? null : movement);
    };

    const handleMovementUnreconciled = (movementId: number) => {
        setReconciliationData(prev => {
            if (!prev) return prev;
            const movements = prev.movements.map(m =>
                m.id === movementId
                    ? { ...m, cfdi_id: null, confidence: null, reconciled_at: null, is_reviewed: false }
                    : m
            );
            const stats = computeStats(movements);
            return { ...prev, movements, stats };
        });
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

    const handleDeleteStatement = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!confirm("¿Estás seguro de que deseas eliminar este estado de cuenta y todos sus movimientos?")) return;

        try {
            await deleteBankStatement(id, activeRfc);
            loadStatements();
            if (result && result.id === id) {
                setResult(null);
                setActiveView('management');
            }
        } catch (e) {
            alert("Error al eliminar");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const data = await processBankStatement(file, activeRfc);
            setResult(data);
            setShowConfirmModal(true);
            setActiveView('detail');
        } catch (err: any) {
            alert(err.message || "Error al procesar el archivo");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await confirmBankStatement({
                rfc: activeRfc,
                bank_name: result.banco,
                account_number: "PREDETERMINADA",
                file_name: result.fileName,
                movements: result.movements,
                summary: result.summary
            }, activeRfc);
            setShowConfirmModal(false);
            setResult(null);
            setActiveView('management');
            alert("¡Estado de cuenta guardado con éxito!");
            loadStatements();
        } catch (err) {
            alert("Error al guardar movimientos");
        } finally {
            setIsConfirming(false);
        }
    };

    const handleExportExcel = () => {
        if (!result?.movements || result.movements.length === 0) {
            alert("No hay movimientos para exportar");
            return;
        }

        // Headers matching UI exactly
        const headers = ["FECHA", "REFERENCIA", "DESCRIPCIÓN", "CARGOS (-)", "ABONOS (+)", "BALANCE"];

        // Helper to escape CSV values
        const escapeCSV = (val: any) => {
            if (val === null || val === undefined) return '""';
            const s = String(val).replace(/"/g, '""');
            return `"${s}"`;
        };

        const rows = result.movements.map((m: any) => [
            escapeCSV(m.fecha),
            escapeCSV(m.referencia || "N/A"),
            escapeCSV(m.concepto),
            m.cargo.toFixed(2),
            m.abono.toFixed(2),
            m.saldo.toFixed(2)
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((r: any) => r.join(","))
        ].join("\n");

        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Estado_de_Cuenta_${result.banco}_${result.period || 'provisional'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleBackClick = () => {
        if (activeView === 'detail' && !showConfirmModal) {
            setActiveView('management');
            setResult(null);
        } else {
            onBack();
        }
    };

    const filteredStatements = statements.filter(s => {
        const matchesBank = bankFilter === 'all' || s.bank_name.toLowerCase() === bankFilter.toLowerCase();
        const matchesYear = yearFilter === 'all' || (s.period && s.period.includes(yearFilter));
        const matchesMonth = monthFilter === 'all' || (s.period && s.period.split('-')[0] === monthFilter);
        const matchesSearch = s.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.period && s.period.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesBank && matchesYear && matchesMonth && matchesSearch;
    });

    const monthsOrder = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const uniqueBanks = Array.from(new Set(statements.map(s => s.bank_name)));
    const uniqueYears = Array.from(new Set(statements.map(s => s.period?.split('-')[1]).filter(y => y))).sort();
    const uniqueMonths = Array.from(new Set(statements.map(s => s.period?.split('-')[0]).filter(m => m)))
        .sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b));

    // Combined balance: sum the latest statement for each bank+account in the filtered set
    const latestPerBank = filteredStatements.reduce((acc, s) => {
        const key = `${s.bank_name}-${s.account_number}`;
        if (!acc[key] || new Date(s.created_at) > new Date(acc[key].created_at)) {
            acc[key] = s;
        }
        return acc;
    }, {} as Record<string, any>);

    const combinedBalance = Object.values(latestPerBank).reduce((acc: number, s: any) => acc + parseFloat(s.final_balance), 0);

    const formatCurrency = (amount: number) => {
        return amount.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        });
    };

    return (
        <div className="flex-1 flex flex-col h-screen bg-[#F8FAFC] overflow-hidden font-['Inter']">
            {/* Header mejorado */}
            <header className="bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between flex-shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-5">
                    <button onClick={handleBackClick} className="w-10 h-10 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-2xl transition-all">
                        <span className="material-symbols-outlined text-xl">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">
                            {activeView === 'management' ? 'Gestión de Bancos' : `Detalle: ${result?.banco || 'Procesando'}`}
                        </h1>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-0.5">
                            {activeView === 'management' ? `Panel contable de ${clientName}` : `${clientName} / ${result?.period || 'Periodo Detectado'}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:bg-gray-50 rounded-xl transition-all relative">
                        <span className="material-symbols-outlined">notifications</span>
                        <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></div>
                    </button>
                    <label className="flex items-center gap-3 px-6 py-2.5 bg-[#10B981] text-white rounded-[16px] font-black text-[11px] shadow-lg shadow-emerald-100 hover:bg-[#059669] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group uppercase tracking-widest">
                        <span className="material-symbols-outlined text-lg group-hover:rotate-90 transition-transform duration-300">add_circle</span>
                        Nuevo Estado
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isProcessing} />
                    </label>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                {activeView === 'management' ? (
                    <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Dashboard Stats */}
                        <div className="bg-white rounded-[40px] p-10 border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full -mr-32 -mt-32 opacity-50 group-hover:scale-110 transition-transform duration-700"></div>
                            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                <div>
                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] mb-4">SALDO GENERAL COMBINADO</p>
                                    <h2 className="text-6xl font-black text-gray-900 tracking-tighter mb-2">
                                        {formatCurrency(combinedBalance)}
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">MXN</span>
                                        <div className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">trending_up</span>
                                            +12.5%
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">CONCILIADO</p>
                                        <p className="text-2xl font-black text-gray-900">94.2%</p>
                                    </div>
                                    <div className="w-px h-10 bg-gray-100"></div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">PENDIENTE</p>
                                        <p className="text-2xl font-black text-orange-500">$24,102</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Search and Filters */}
                        <div className="bg-white rounded-[32px] p-4 border border-gray-100 shadow-lg shadow-gray-100/50 flex flex-col md:flex-row items-center gap-4">
                            <div className="flex-1 relative w-full">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por cuenta o referencia..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-gray-400"
                                />
                            </div>
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <select
                                    value={bankFilter}
                                    onChange={e => setBankFilter(e.target.value)}
                                    className="flex-1 md:flex-none text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                                >
                                    <option value="all">Bancos</option>
                                    {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <select
                                    value={monthFilter}
                                    onChange={e => setMonthFilter(e.target.value)}
                                    className="flex-1 md:flex-none text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                                >
                                    <option value="all">Cualquier Mes</option>
                                    {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                    value={yearFilter}
                                    onChange={e => setYearFilter(e.target.value)}
                                    className="flex-1 md:flex-none text-[10px] font-black bg-white border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest"
                                >
                                    <option value="all">Año</option>
                                    {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Grid of Bank Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {filteredStatements.length > 0 ? filteredStatements.map((s) => (
                                <div
                                    key={s.id}
                                    onClick={() => handleSelectStatement(s.id)}
                                    className="bg-white rounded-[40px] border border-gray-100 p-8 hover:border-emerald-200 hover:shadow-2xl hover:shadow-emerald-100/20 transition-all cursor-pointer group flex flex-col justify-between min-h-[400px] relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50 rounded-bl-full -tr-10 -mr-10 group-hover:bg-emerald-50 transition-colors"></div>

                                    <div className="relative">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                <span className="material-symbols-outlined text-white text-2xl">account_balance</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteStatement(e, s.id)}
                                                className="w-10 h-10 rounded-xl text-gray-200 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                        <div className="mb-6">
                                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight group-hover:text-emerald-600 transition-colors">{s.bank_name}</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">CUENTA: **** {s.account_number?.slice(-4) || 'NADA'}</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-50">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">INICIAL</p>
                                                <p className="text-sm font-black text-gray-600">{formatCurrency(parseFloat(s.initial_balance))}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">FINAL</p>
                                                <p className="text-sm font-black text-emerald-600">{formatCurrency(parseFloat(s.final_balance))}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">CARGOS (-)</p>
                                                <p className="text-sm font-black text-red-500">-{formatCurrency(parseFloat(s.total_cargos))}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">ABONOS (+)</p>
                                                <p className="text-sm font-black text-emerald-500">+{formatCurrency(parseFloat(s.total_abonos))}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{s.period}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-gray-300 uppercase tracking-[0.2em]">Resumen del periodo</span>
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                                                <span className="material-symbols-outlined text-xl">arrow_forward</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full py-40 flex flex-col items-center justify-center bg-gray-50/50 rounded-[60px] border-2 border-dashed border-gray-100">
                                    <span className="material-symbols-outlined text-gray-200 text-6xl mb-6">history</span>
                                    <h4 className="text-gray-400 text-sm font-black uppercase tracking-[0.3em]">No hay actividad bancaria registrada</h4>
                                    <p className="text-gray-400 text-xs font-medium italic mt-2">Sube tu primer PDF para comenzar la gestión financiera.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Detail View Components (Existing Logic Improved) */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-3 px-8 py-3.5 bg-white border border-gray-200 text-gray-400 rounded-[20px] font-bold text-sm hover:border-emerald-200 hover:text-emerald-500 hover:shadow-lg hover:shadow-gray-100 transition-all active:scale-[0.98]">
                                    <span className="material-symbols-outlined">export_notes</span>
                                    Exportar a Excel
                                </button>
                                {result?.id && (
                                    <button
                                        onClick={handleToggleReconciliation}
                                        disabled={isLoadingSuggestions}
                                        className={`flex items-center gap-2 px-6 py-3.5 rounded-[20px] font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-60 ${reconciliationMode ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'}`}
                                    >
                                        {isLoadingSuggestions
                                            ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            : <span className="material-symbols-outlined text-lg">balance</span>
                                        }
                                        {reconciliationMode ? 'Ver Normal' : 'Conciliar'}
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-10">
                                <div className="flex flex-col items-end">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Periodo Activo</p>
                                    <p className="text-sm font-black text-orange-500 bg-orange-50 px-3 py-1 rounded-lg uppercase tracking-wide">{result?.period}</p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Empresa / Cliente</p>
                                    <p className="text-sm font-black text-gray-900 border-b-2 border-emerald-500/30 pb-0.5 uppercase tracking-tight">{clientName}</p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Institución</p>
                                    <p className="text-sm font-black text-gray-400 border-b-2 border-gray-100 pb-0.5 tracking-widest">{result?.banco}</p>
                                </div>
                            </div>
                        </div>

                        {/* Kardex Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                            <Card title="SALDO INICIAL" amount={result?.summary?.initialBalance || 0} icon="swap_horiz" color="gray" />
                            <Card title="DEPÓSITOS (+)" amount={result?.summary?.totalAbonos || 0} icon="add_circle" color="emerald" plus />
                            <Card title="RETIROS (-)" amount={result?.summary?.totalCargos || 0} icon="remove_circle" color="red" minus />
                            <Card title="SALDO FINAL" amount={result?.summary?.finalBalance || 0} icon="check_circle" color="emerald" highlight />
                        </div>

                        {/* Movements Table */}
                        <div className="bg-white rounded-[48px] border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden flex flex-col">
                            <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/30">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.4em]">
                                        {reconciliationMode ? 'CONCILIACIÓN DE MOVIMIENTOS' : 'REGISTRO DE TRANSACCIONES'}
                                    </h3>
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                </div>
                                {reconciliationMode && reconciliationData ? (
                                    <div className="flex items-center gap-3">
                                        {[
                                            { key: 'green', label: 'AUTO', color: 'bg-emerald-500' },
                                            { key: 'yellow', label: 'REVISAR', color: 'bg-yellow-400' },
                                            { key: 'red', label: 'MANUAL', color: 'bg-red-400' },
                                            { key: 'unmatched', label: 'PENDIENTE', color: 'bg-gray-300' },
                                        ].map(({ key, label, color }) => (
                                            <div key={key} className="flex items-center gap-1.5">
                                                <div className={`w-2 h-2 rounded-full ${color}`} />
                                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                                    {(reconciliationData.stats as any)[key]} {label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-1.5 bg-emerald-50 rounded-full">
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{result?.movements?.length || 0} OPERACIONES DETECTADAS</span>
                                    </div>
                                )}
                            </div>

                            {reconciliationMode && reconciliationData ? (
                                <div className="flex overflow-hidden">
                                    <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
                                        {/* Header — resizable */}
                                        <div
                                            style={{ gridTemplateColumns: gridTemplate }}
                                            className="grid gap-0 bg-gray-50/80 border-b border-gray-100 sticky top-0 z-10 select-none"
                                        >
                                            {COL_HEADERS.map((h, i) => (
                                                <div key={`${h}-${i}`} className="relative flex items-center px-4 py-3 border-r border-gray-200 last:border-r-0">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
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
                                        {reconciliationData.movements.map((m: BankMovement) => (
                                            <MovementReconcileRow
                                                key={m.id}
                                                movement={m}
                                                isSelected={selectedMovement?.id === m.id}
                                                onSelect={handleSelectMovement}
                                                onUnreconciled={handleMovementUnreconciled}
                                                gridTemplate={gridTemplate}
                                            />
                                        ))}
                                    </div>
                                    {selectedMovement && (
                                        <ReconciliationSidebar
                                            movement={selectedMovement}
                                            onClose={() => setSelectedMovement(null)}
                                            onReconciled={handleMovementReconciled}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-white">
                                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">FECHA</th>
                                                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">REFERENCIA</th>
                                                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50">DESCRIPCIÓN</th>
                                                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">CARGOS (-)</th>
                                                <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">ABONOS (+)</th>
                                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-50 text-right">BALANCE</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50/50">
                                            {(result?.movements || []).map((m: any, i: number) => (
                                                <tr key={i} className="hover:bg-emerald-50/30 transition-all duration-200 group">
                                                    <td className="px-10 py-6 text-xs font-black text-gray-400 group-hover:text-emerald-700 transition-colors uppercase">{m.fecha}</td>
                                                    <td className="px-6 py-6">
                                                        <span className="px-2.5 py-1 bg-gray-50 text-[9px] font-black text-gray-400 rounded-lg group-hover:bg-white group-hover:text-emerald-500 transition-all border border-transparent group-hover:border-emerald-100">{m.referencia || 'N/A'}</span>
                                                    </td>
                                                    <td className="px-6 py-6">
                                                        <p className="text-xs font-bold text-gray-900 leading-normal uppercase group-hover:translate-x-1 transition-transform">{m.concepto}</p>
                                                    </td>
                                                    <td className="px-6 py-6 text-right">
                                                        <span className={`text-sm font-black ${m.cargo > 0 ? 'text-[#FF4D4D]' : 'text-gray-200'}`}>
                                                            {m.cargo > 0 ? `-${formatCurrency(m.cargo)}` : '$0.00'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-6 text-right">
                                                        <span className={`text-sm font-black ${m.abono > 0 ? 'text-[#10B981]' : 'text-gray-200'}`}>
                                                            {m.abono > 0 ? `+${formatCurrency(m.abono)}` : '$0.00'}
                                                        </span>
                                                    </td>
                                                    <td className="px-10 py-6 text-right">
                                                        <span className="text-sm font-black text-gray-900">{formatCurrency(m.saldo || 0)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer de status */}
            <footer className="bg-white border-t border-gray-100 px-8 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400'}`}></div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{isProcessing ? 'Procesando Datos...' : 'Motor Bancario Activo'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Fiscalio v2.1.0-stable</span>
                </div>
            </footer>

            {/* Modal de confirmación para nuevos archivos */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-xl transition-all">
                    <div className="relative w-full max-w-lg bg-white rounded-[48px] shadow-2xl overflow-hidden p-12 transition-all animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center mb-8 shadow-inner border border-emerald-100/50">
                                <span className="material-symbols-outlined text-[#10B981] text-4xl">check_circle</span>
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Confirmar Importación</h2>
                            <p className="text-sm text-gray-400 leading-relaxed font-medium mb-12">
                                Valide los totales extraídos del archivo <span className="text-gray-900 font-black">{result?.fileName}</span>
                            </p>

                            <div className="w-full space-y-4 mb-10">
                                <div className="bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-100">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Inicial</span>
                                    <span className="text-lg font-black text-gray-900">{formatCurrency(result?.summary?.initialBalance || 0)}</span>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1 bg-emerald-50/50 p-5 rounded-[28px] border border-emerald-100">
                                        <p className="text-[9px] font-black text-emerald-800 uppercase tracking-widest mb-1">Abonos (+)</p>
                                        <p className="text-xl font-black text-emerald-600">{formatCurrency(result?.summary?.totalAbonos || 0)}</p>
                                    </div>
                                    <div className="flex-1 bg-red-50/50 p-5 rounded-[28px] border border-red-100">
                                        <p className="text-[9px] font-black text-red-800 uppercase tracking-widest mb-1">Cargos (-)</p>
                                        <p className="text-xl font-black text-red-600">{formatCurrency(result?.summary?.totalCargos || 0)}</p>
                                    </div>
                                </div>
                                <div className="pt-6 border-t border-dashed border-gray-100 flex flex-col items-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">SALDO FINAL CALCULADO</span>
                                    <h3 className="text-4xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency((result?.summary?.initialBalance || 0) + (result?.summary?.totalAbonos || 0) - (result?.summary?.totalCargos || 0))}
                                    </h3>
                                    <div className="mt-4 flex items-center gap-2 px-4 py-1.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse shadow-lg shadow-emerald-200">
                                        <span className="material-symbols-outlined text-sm">verified</span>
                                        Debe coincidir con la carátula
                                    </div>
                                </div>
                            </div>

                            <div className="w-full space-y-4">
                                <button
                                    onClick={handleConfirm}
                                    disabled={isConfirming}
                                    className="w-full py-5 bg-[#10B981] text-white font-black rounded-3xl shadow-xl shadow-emerald-200/50 hover:bg-[#059669] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 tracking-widest text-xs uppercase disabled:opacity-50"
                                >
                                    {isConfirming ? 'Guardando...' : 'Confirmar y Guardar'}
                                </button>
                                <button
                                    onClick={() => { setShowConfirmModal(false); setResult(null); setActiveView('management'); }}
                                    className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                                >
                                    Cancelar Operación
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Overlay de procesamiento */}
            {isProcessing && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/60 backdrop-blur-xl">
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest animate-pulse">Analizando PDF...</h2>
                    </div>
                </div>
            )}
        </div>
    );
};

const Card = ({ title, amount, icon, color, plus, minus, highlight }: any) => {
    let bg = "bg-white border-gray-100 shadow-xl shadow-gray-100/30";
    let iconBg = "bg-gray-50 text-gray-400";
    let textAmount = "text-gray-900";
    let labelColor = "text-gray-400";

    if (color === 'emerald') {
        iconBg = "bg-emerald-50 text-emerald-500";
        if (highlight) {
            bg = "bg-[#10B981] border-[#10B981] shadow-2xl shadow-emerald-200/50 text-white";
            iconBg = "bg-white/20 text-white";
            textAmount = "text-white";
            labelColor = "text-white/70";
        } else {
            textAmount = "text-emerald-500 font-black";
        }
    } else if (color === 'red') {
        iconBg = "bg-red-50 text-red-500";
        textAmount = "text-red-500 font-black";
    }

    return (
        <div className={`${bg} rounded-[40px] border p-10 transition-all duration-300 hover:scale-[1.02] cursor-default flex flex-col justify-between h-52`}>
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${labelColor}`}>{title}</span>
                <div className={`p-3 rounded-2xl ${iconBg}`}>
                    <span className="material-symbols-outlined text-2xl">{icon}</span>
                </div>
            </div>
            <div className="mt-auto">
                <h4 className={`text-4xl font-black ${textAmount} tracking-tighter truncate leading-none`}>
                    {plus ? '+ ' : minus ? '- ' : ''}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h4>
            </div>
        </div>
    );
};
