import { useState, useEffect, useRef } from 'react';
import { reconcileMovement, unreconcileMovement, searchCfdisManual } from '../services';
import type { BankMovement, Cfdi, ReconciliationSuggestion } from '../models';

interface Props {
    movement: BankMovement;
    activeRfc: string;
    onClose: () => void;
    onReconciled: (updated: BankMovement) => void;
    onViewPdf: (uuid: string, title: string) => void;
    onDownloadPdf: (uuid: string) => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

type FilterChip = 'monto' | 'fecha' | 'rfc';

export function ReconciliationSidebar({ movement, activeRfc, onClose, onReconciled, onViewPdf }: Props) {
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set(['monto']));
    const [loadingId, setLoadingId] = useState<number | null>(null);
    const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualQuery, setManualQuery] = useState('');
    const [manualResults, setManualResults] = useState<any[]>([]);
    const [manualLoading, setManualLoading] = useState(false);
    const manualDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isEgreso = movement.cargo > 0;
    const amount = isEgreso ? movement.cargo : movement.abono;
    const allSuggestions: ReconciliationSuggestion[] = movement.suggestions ?? [];
    const linkedCfdis: Cfdi[] = movement.cfdis ?? [];
    const hasLinked = linkedCfdis.length > 0;

    const counterpart = (s: any) =>
        s.tipo === 'N'
            ? (s.name_receptor || s.rfc_receptor)
            : isEgreso ? (s.name_emisor || s.rfc_emisor) : (s.name_receptor || s.rfc_receptor);
    const counterpartRfc = (s: any) =>
        s.tipo === 'N'
            ? s.rfc_receptor
            : isEgreso ? s.rfc_emisor : s.rfc_receptor;

    const toggleFilter = (f: FilterChip) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            next.has(f) ? next.delete(f) : next.add(f);
            return next;
        });
    };

    useEffect(() => {
        if (!isManualMode || manualQuery.trim().length < 2) {
            setManualResults([]);
            return;
        }
        if (manualDebounce.current) clearTimeout(manualDebounce.current);
        manualDebounce.current = setTimeout(async () => {
            setManualLoading(true);
            try {
                const res = await searchCfdisManual(activeRfc, manualQuery.trim(), isEgreso ? 'egreso' : 'ingreso');
                // Filter out already linked CFDIs
                const linkedIds = new Set(linkedCfdis.map(c => c.id));
                setManualResults((res.cfdis ?? []).filter((c: any) => !linkedIds.has(c.id)));
            } catch {
                setManualResults([]);
            } finally {
                setManualLoading(false);
            }
        }, 400);
        return () => { if (manualDebounce.current) clearTimeout(manualDebounce.current); };
    }, [manualQuery, isManualMode, linkedCfdis.length]);

    const handleConfirmManual = async (cfdi: any) => {
        setLoadingId(cfdi.id);
        try {
            const res = await reconcileMovement(movement.id, cfdi.id, 'red');
            onReconciled({ ...res.movement, suggestions: movement.suggestions });
            // Remove from manual results since it's now linked
            setManualResults(prev => prev.filter(c => c.id !== cfdi.id));
        } catch (e) {
            console.error(e);
            alert('Error al conciliar. Revisa la consola.');
        } finally {
            setLoadingId(null);
        }
    };

    const handleConfirm = async (s: ReconciliationSuggestion) => {
        setLoadingId(s.cfdi_id);
        try {
            const res = await reconcileMovement(movement.id, s.cfdi_id, s.confidence);
            onReconciled({ ...res.movement, suggestions: movement.suggestions });
        } catch (e) {
            console.error(e);
            alert('Error al conciliar. Revisa la consola.');
        } finally {
            setLoadingId(null);
        }
    };

    const handleUnlinkOne = async (cfdiId: number) => {
        setUnlinkingId(cfdiId);
        try {
            const res = await unreconcileMovement(movement.id, cfdiId);
            onReconciled({ ...res.movement, suggestions: movement.suggestions });
        } catch (e) {
            console.error(e);
        } finally {
            setUnlinkingId(null);
        }
    };

    const descTrunc = movement.description.length > 55
        ? movement.description.slice(0, 55).trimEnd() + '…'
        : movement.description;

    // Filter suggestions, exclude already linked
    const linkedIds = new Set(linkedCfdis.map(c => c.id));
    let filtered = allSuggestions.filter(s => !linkedIds.has(s.cfdi_id));

    if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(s =>
            s.uuid.toLowerCase().includes(q) ||
            (counterpart(s) || '').toLowerCase().includes(q) ||
            (counterpartRfc(s) || '').toLowerCase().includes(q) ||
            String(s.total).includes(q)
        );
    }

    if (activeFilters.has('monto')) {
        const exact = filtered.filter(s => Math.abs(s.total - amount) < 0.01);
        if (exact.length > 0) filtered = exact;
    }
    if (activeFilters.has('rfc')) {
        const rfcMatch = filtered.filter(s => {
            const rfc = counterpartRfc(s);
            return movement.description.toLowerCase().includes((rfc || '').toLowerCase());
        });
        if (rfcMatch.length > 0) filtered = rfcMatch;
    }
    if (activeFilters.has('fecha')) {
        filtered = [...filtered].sort((a, b) => a.days_diff - b.days_diff);
    }

    // Totals
    const linkedTotal = linkedCfdis.reduce((sum, c) => sum + (c.total ?? 0), 0);
    const diff = amount - linkedTotal;

    return (
        <div className="w-[420px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col h-full overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    {hasLinked ? 'Facturas Vinculadas' : 'Vincular CFDI con Movimiento'}
                </h2>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            {/* Movement info */}
            <div className="mx-6 mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 flex-shrink-0">
                <span className="material-symbols-outlined text-blue-500 text-xl font-medium">info</span>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 font-medium">
                        {isEgreso ? 'Egreso' : 'Ingreso'}:{' '}
                        <strong className="text-gray-900 font-black uppercase">{descTrunc}</strong>
                    </p>
                    <p className="text-sm font-black text-gray-900 mt-1">
                        {isEgreso ? '-' : '+'}{fmt(amount)}
                        {hasLinked && (
                            <span className={`ml-2 text-xs font-bold ${Math.abs(diff) < 0.05 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {Math.abs(diff) < 0.05 ? '✓ Cuadrado' : `Diferencia: ${fmt(diff)}`}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* Linked CFDIs list */}
            {hasLinked && (
                <div className="mx-6 mt-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                            {linkedCfdis.length} factura{linkedCfdis.length !== 1 ? 's' : ''} vinculada{linkedCfdis.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] font-black text-gray-500">{fmt(linkedTotal)}</span>
                    </div>
                    <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-hide">
                        {linkedCfdis.map(cfdi => {
                            const name = counterpart(cfdi) || '—';
                            const rfc = counterpartRfc(cfdi) || '—';
                            const isUnlinking = unlinkingId === cfdi.id;
                            return (
                                <div key={cfdi.id} className="flex items-center gap-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-gray-800 truncate uppercase">{name}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">{rfc} · {formatDate(cfdi.fecha)}</p>
                                    </div>
                                    <p className="text-xs font-black text-gray-800 tabular-nums flex-shrink-0">{fmt(cfdi.total)}</p>
                                    <div className="flex gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => onViewPdf(cfdi.uuid, name)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                            title="Ver PDF"
                                        >
                                            <span className="material-symbols-outlined text-base">visibility</span>
                                        </button>
                                        <button
                                            onClick={() => handleUnlinkOne(cfdi.id)}
                                            disabled={isUnlinking}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                            title="Desvincular esta factura"
                                        >
                                            {isUnlinking
                                                ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                : <span className="material-symbols-outlined text-base">link_off</span>
                                            }
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
                            Agregar otra factura
                        </p>
                    </div>
                </div>
            )}

            {/* Search / Filters */}
            {!isManualMode ? (
                <>
                    <div className="px-6 mt-3 flex-shrink-0">
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus-within:border-blue-400 focus-within:bg-white transition-all">
                            <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por Folio, RFC o Monto..."
                                className="flex-1 bg-transparent text-xs text-gray-700 font-bold placeholder-gray-400 outline-none"
                            />
                        </div>
                    </div>
                    <div className="px-6 mt-3 flex gap-2 flex-shrink-0">
                        {([
                            { key: 'monto' as FilterChip, label: 'Mismo monto' },
                            { key: 'fecha' as FilterChip, label: 'Fecha próxima' },
                            { key: 'rfc' as FilterChip, label: 'RFC frecuente' },
                        ]).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => toggleFilter(key)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeFilters.has(key)
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-100'
                                    : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <div className="px-6 mt-3 flex-shrink-0">
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl focus-within:border-amber-400 transition-all">
                        <span className="material-symbols-outlined text-amber-400 text-lg">manage_search</span>
                        <input
                            autoFocus
                            type="text"
                            value={manualQuery}
                            onChange={e => setManualQuery(e.target.value)}
                            placeholder="UUID, RFC, nombre del emisor/receptor..."
                            className="flex-1 bg-transparent text-xs text-gray-700 font-bold placeholder-gray-400 outline-none"
                        />
                        {manualLoading && <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                    </div>
                </div>
            )}

            {/* Suggestions / Manual results */}
            <div className="flex-1 overflow-y-auto px-6 mt-4 pb-4 space-y-4 scrollbar-hide">
                {isManualMode ? (
                    manualQuery.trim().length < 2 ? (
                        <div className="text-center py-12 flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-amber-200 mb-3">manage_search</span>
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Escribe al menos 2 caracteres</p>
                        </div>
                    ) : manualResults.length === 0 && !manualLoading ? (
                        <div className="text-center py-12 flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-gray-200 mb-3">search_off</span>
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Sin resultados</p>
                        </div>
                    ) : (
                        manualResults.map((cfdi) => {
                            const name = isEgreso ? (cfdi.name_emisor || cfdi.rfc_emisor) : (cfdi.name_receptor || cfdi.rfc_receptor);
                            const rfc = isEgreso ? cfdi.rfc_emisor : cfdi.rfc_receptor;
                            const isLoading = loadingId === cfdi.id;
                            return (
                                <div key={cfdi.id} className="relative rounded-[24px] border-2 border-amber-100 hover:border-amber-200 p-5 transition-all">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {cfdi.tipo}: <span className="text-gray-300 ml-1">{cfdi.uuid.slice(0, 14)}…</span>
                                        </span>
                                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase tracking-tighter">
                                            Manual
                                        </span>
                                    </div>
                                    <p className="font-black text-gray-900 text-sm leading-tight uppercase truncate mb-1">{name || '—'}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">RFC: {rfc || '—'}</p>
                                    <div className="flex justify-between items-end mt-4">
                                        <p className="text-[11px] font-black text-gray-700">
                                            {formatDate((cfdi.tipo === 'N' && cfdi.nomina_fecha_pago) ? cfdi.nomina_fecha_pago : cfdi.fecha)}
                                        </p>
                                        <p className="text-xl font-black text-gray-900 tabular-nums">{fmt(cfdi.total)}</p>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <button
                                            onClick={() => onViewPdf(cfdi.uuid, name || cfdi.uuid)}
                                            className="w-10 h-10 flex items-center justify-center rounded-[14px] border border-gray-100 text-gray-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 transition-all flex-shrink-0"
                                            title="Ver PDF"
                                        >
                                            <span className="material-symbols-outlined text-lg">visibility</span>
                                        </button>
                                        <button
                                            onClick={() => handleConfirmManual(cfdi)}
                                            disabled={loadingId !== null}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-100 border border-amber-400"
                                        >
                                            {isLoading
                                                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                : <><span className="material-symbols-outlined text-base font-black">add_link</span>Agregar</>}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center">
                        <div className="w-14 h-14 bg-gray-50 rounded-3xl flex items-center justify-center mb-3">
                            <span className="material-symbols-outlined text-3xl text-gray-200">search_off</span>
                        </div>
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Sin coincidencias encontradas</p>
                    </div>
                ) : (
                    filtered.map((s, i) => {
                        const isBest = i === 0 && s.confidence === 'green' && !hasLinked;
                        const name = counterpart(s) || '—';
                        const rfc = counterpartRfc(s) || '—';
                        const isLoading = loadingId === s.cfdi_id;
                        const dateDisplay = s.match_via === 'payment' && s.fecha_pago
                            ? formatDate(s.fecha_pago)
                            : formatDate(s.fecha);
                        const tipoLabel = s.match_via === 'payment' ? 'REP' : s.tipo;

                        return (
                            <div
                                key={s.cfdi_id}
                                className={`relative rounded-[24px] border-2 p-5 transition-all ${isBest ? 'border-emerald-500 shadow-lg shadow-emerald-50' : 'border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                {isBest && (
                                    <div className="absolute -top-3 left-5 bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-[0.15em] shadow-lg shadow-emerald-200">
                                        <span className="material-symbols-outlined text-[11px] font-black">star</span>
                                        Mejor coincidencia
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                        {tipoLabel}: <span className="text-gray-300 ml-1">{s.uuid.slice(0, 14)}…</span>
                                    </span>
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-tighter">
                                        VIGENTE
                                    </span>
                                </div>

                                <p className="font-black text-gray-900 text-sm leading-tight uppercase truncate mb-1">{name}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">RFC: {rfc}</p>

                                {s.forma_pago && (
                                    <span className="inline-block mt-2 text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-wider border border-blue-100">
                                        {s.forma_pago}
                                    </span>
                                )}

                                {s.match_via === 'payment' && s.related_invoices && s.related_invoices.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest mr-1">
                                            {s.payments_count ?? s.related_invoices.length} facturadas:
                                        </span>
                                        {s.related_invoices.slice(0, 2).map((uuid, j) => (
                                            <span key={j} className="text-[9px] font-black text-purple-500 bg-purple-50 px-2 py-1 rounded-lg border border-purple-100">
                                                {uuid.slice(0, 10)}…
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-between items-end mt-4">
                                    <div>
                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-1">
                                            {s.match_via === 'payment' ? 'Fecha Pago' : 'Fecha Emisión'}
                                        </p>
                                        <p className="text-[11px] font-black text-gray-700">{dateDisplay}</p>
                                        {s.days_diff > 0 && (
                                            <p className="text-[9px] font-bold text-amber-500 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                                +{s.days_diff} días diferencia
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-1">Total CFDI</p>
                                        <p className="text-xl font-black text-gray-900 tabular-nums">{fmt(s.total)}</p>
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => onViewPdf(s.uuid, name)}
                                        className="w-10 h-10 flex items-center justify-center rounded-[14px] border border-gray-100 text-gray-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 transition-all flex-shrink-0"
                                        title="Ver PDF"
                                    >
                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                    </button>
                                    <button
                                        onClick={() => handleConfirm(s)}
                                        disabled={loadingId !== null}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[14px] font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 ${isBest
                                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100 border border-emerald-400'
                                            : 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-100 hover:border-gray-200'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-base font-black">
                                                    {hasLinked ? 'add_link' : (isBest ? 'check_circle' : 'link')}
                                                </span>
                                                {hasLinked ? 'Agregar' : 'Vincular Factura'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex-shrink-0 bg-gray-50/30">
                {isManualMode ? (
                    <button
                        onClick={() => { setIsManualMode(false); setManualQuery(''); setManualResults([]); }}
                        className="flex items-center gap-2 mx-auto px-6 py-3 bg-white border border-gray-200 rounded-2xl text-[11px] font-black text-gray-500 hover:border-gray-300 transition-all uppercase tracking-widest"
                    >
                        <span className="material-symbols-outlined text-lg">arrow_back</span>
                        Volver a sugerencias
                    </button>
                ) : (
                    <div className="text-center">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-3">¿No encuentras la factura?</p>
                        <button
                            onClick={() => setIsManualMode(true)}
                            className="flex items-center gap-2 mx-auto px-6 py-3 bg-white border border-amber-200 rounded-2xl text-[11px] font-black text-amber-600 hover:text-amber-700 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-50 transition-all uppercase tracking-widest"
                        >
                            <span className="material-symbols-outlined text-lg">manage_search</span>
                            {hasLinked ? 'Búsqueda manual' : 'Asignar manualmente'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
