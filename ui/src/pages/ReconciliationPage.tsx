import { useState, useEffect } from 'react';
import { listBankStatements, getReconciliationSuggestions, reconcileMovement } from '../services';
import { MovementReconcileRow } from '../components/MovementReconcileRow';
import type { BankStatement, BankMovement, ReconciliationStats } from '../models';

interface Props {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

export function ReconciliationPage({ activeRfc, clientName, onBack }: Props) {
    const [statements, setStatements] = useState<BankStatement[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [reconciliationData, setReconciliationData] = useState<{ movements: BankMovement[]; stats: ReconciliationStats } | null>(null);
    const [isLoadingStatements, setIsLoadingStatements] = useState(true);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isBulkConfirming, setIsBulkConfirming] = useState(false);

    useEffect(() => {
        loadStatements();
    }, [activeRfc]);

    const loadStatements = async () => {
        setIsLoadingStatements(true);
        try {
            const data = await listBankStatements(activeRfc);
            setStatements(data);
        } finally {
            setIsLoadingStatements(false);
        }
    };

    const handleSelectStatement = async (id: number) => {
        if (selectedId === id) return;
        setSelectedId(id);
        setReconciliationData(null);
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
                    ? { ...m, cfdi_id: null, confidence: null, reconciled_at: null, is_reviewed: false }
                    : m
            );
            return { movements, stats: computeStats(movements) };
        });
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

    const selectedStatement = statements.find(s => s.id === selectedId);
    const greenPendingCount = reconciliationData?.movements.filter(
        m => !m.cfdi_id && m.suggestions?.[0]?.confidence === 'green'
    ).length ?? 0;

    return (
        <div className="flex h-screen bg-[#F8FAFC] font-['Inter'] overflow-hidden">
            {/* Left panel — statement inbox */}
            <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
                <div className="px-6 py-5 border-b border-gray-100">
                    <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-gray-700 transition-colors mb-4">
                        <span className="material-symbols-outlined text-lg">arrow_back</span>
                        <span className="text-xs font-black uppercase tracking-widest">Volver</span>
                    </button>
                    <h1 className="text-base font-black text-gray-900 uppercase tracking-tight">Conciliación</h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{clientName}</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoadingStatements ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : statements.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <span className="material-symbols-outlined text-4xl text-gray-200 block mb-3">account_balance</span>
                            <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Sin estados de cuenta</p>
                        </div>
                    ) : (
                        <div className="p-3 space-y-1">
                            {statements.map(s => {
                                const isSelected = s.id === selectedId;
                                const total = (s as any).movements_count ?? 0;
                                const reconciled = (s as any).reconciled_count ?? 0;
                                const pct = total > 0 ? Math.round((reconciled / total) * 100) : 0;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => handleSelectStatement(s.id)}
                                        className={`w-full text-left px-4 py-3 rounded-2xl transition-all ${isSelected ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'}`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                                                {s.bank_name}
                                            </span>
                                            <span className={`text-[9px] font-black uppercase ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                                                {s.period}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className={`text-[9px] font-medium ${isSelected ? 'text-gray-400' : 'text-gray-400'}`}>
                                                {total} mov.
                                            </span>
                                            <span className={`text-[9px] font-black ${isSelected ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                                {pct}% conciliado
                                            </span>
                                        </div>
                                        <div className={`w-full h-1 rounded-full ${isSelected ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                            <div
                                                className={`h-1 rounded-full transition-all ${isSelected ? 'bg-emerald-400' : 'bg-emerald-500'}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel — movements + suggestions */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedId ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <span className="material-symbols-outlined text-6xl text-gray-200">balance</span>
                        <p className="text-sm font-black text-gray-300 uppercase tracking-[0.3em]">Selecciona un estado de cuenta</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                    {selectedStatement?.bank_name} — {selectedStatement?.period}
                                </h2>
                                <div className="flex items-center gap-4 mt-1">
                                    {reconciliationData && [
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
                            </div>
                            {greenPendingCount > 0 && (
                                <button
                                    onClick={handleBulkConfirmGreen}
                                    disabled={isBulkConfirming}
                                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-emerald-100"
                                >
                                    {isBulkConfirming
                                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        : <span className="material-symbols-outlined text-base">auto_awesome</span>
                                    }
                                    Conciliar {greenPendingCount} automáticos
                                </button>
                            )}
                        </div>

                        {/* Movements list */}
                        <div className="flex-1 overflow-y-auto bg-white">
                            {isLoadingSuggestions ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Analizando coincidencias…</p>
                                </div>
                            ) : reconciliationData ? (
                                <>
                                    {/* Column headers */}
                                    <div className="grid grid-cols-[130px_1fr_140px_140px_140px_200px] gap-2 px-8 py-3 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                                        {['FECHA', 'DESCRIPCIÓN', 'CARGOS (-)', 'ABONOS (+)', 'ESTADO', 'CFDI'].map(h => (
                                            <span key={h} className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</span>
                                        ))}
                                    </div>
                                    {reconciliationData.movements.map(m => (
                                        <MovementReconcileRow
                                            key={m.id}
                                            movement={m}
                                            onReconciled={handleMovementReconciled}
                                            onUnreconciled={handleMovementUnreconciled}
                                        />
                                    ))}
                                </>
                            ) : null}
                        </div>

                        {/* Footer summary */}
                        {selectedStatement && (
                            <div className="bg-white border-t border-gray-100 px-8 py-3 flex items-center gap-8 flex-shrink-0">
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
        </div>
    );
}
