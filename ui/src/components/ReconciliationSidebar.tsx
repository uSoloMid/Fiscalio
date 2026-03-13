import { useState, useEffect, useRef } from 'react';
import { reconcileMovement, searchCfdisManual } from '../services';
import type { BankMovement, ReconciliationSuggestion } from '../models';

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

export function ReconciliationSidebar({ movement, activeRfc, onClose, onReconciled, onViewPdf, onDownloadPdf }: Props) {
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set(['monto']));
    const [loadingId, setLoadingId] = useState<number | null>(null);
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualQuery, setManualQuery] = useState('');
    const [manualResults, setManualResults] = useState<any[]>([]);
    const [manualLoading, setManualLoading] = useState(false);
    const manualDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isEgreso = movement.cargo > 0;
    const amount = isEgreso ? movement.cargo : movement.abono;
    const allSuggestions: ReconciliationSuggestion[] = movement.suggestions ?? [];
    const isReconciled = !!movement.cfdi;
    const cfdi = movement.cfdi;

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
                setManualResults(res.cfdis ?? []);
            } catch {
                setManualResults([]);
            } finally {
                setManualLoading(false);
            }
        }, 400);
        return () => { if (manualDebounce.current) clearTimeout(manualDebounce.current); };
    }, [manualQuery, isManualMode]);

    const handleConfirmManual = async (cfdi: any) => {
        setLoadingId(cfdi.id);
        try {
            const res = await reconcileMovement(movement.id, cfdi.id, 'red');
            onReconciled({ ...res.movement, suggestions: [] });
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
            onReconciled({ ...res.movement, suggestions: [] });
        } catch (e) {
            console.error(e);
            alert('Error al conciliar. Revisa la consola.');
        } finally {
            setLoadingId(null);
        }
    };

    const descTrunc = movement.description.length > 55
        ? movement.description.slice(0, 55).trimEnd() + '…'
        : movement.description;

    // Render Policy Preview
    const renderPrePolicy = () => {
        if (!cfdi) return null;
        const total = cfdi.total;
        const subtotal = cfdi.subtotal || (total / 1.16);
        const iva = total - subtotal;
        const concept = `PÓLIZA AUTO: ${isEgreso ? 'PAGO' : 'COBRO'} ${counterpart(cfdi)}`.toUpperCase();

        return (
            <div className="mt-6 border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Pre-Póliza Automática</h3>
                    <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">Sugerida</span>
                </div>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase">Concepto</p>
                            <p className="text-[10px] font-bold text-gray-700 leading-tight mt-0.5">{concept}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black text-gray-400 uppercase">Tipo</p>
                            <p className="text-[10px] font-bold text-gray-700 mt-0.5">{isEgreso ? 'EGRESO' : 'INGRESO'}</p>
                        </div>
                    </div>
                    <div className="space-y-2 mt-4">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-500 font-medium">102.01 Bancos Nacionales</span>
                            <span className={`font-black ${isEgreso ? 'text-red-500' : 'text-emerald-600'}`}>
                                {isEgreso ? `- ${fmt(total)}` : `+ ${fmt(total)}`}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-500 font-medium">{isEgreso ? '601.01 Gastos Generales' : '401.01 Ingresos por Ventas'}</span>
                            <span className={`font-black ${isEgreso ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isEgreso ? `+ ${fmt(subtotal)}` : `- ${fmt(subtotal)}`}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-500 font-medium">{isEgreso ? '118.01 IVA Acreditable' : '208.01 IVA Trasladado'}</span>
                            <span className={`font-black ${isEgreso ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isEgreso ? `+ ${fmt(iva)}` : `- ${fmt(iva)}`}
                            </span>
                        </div>
                    </div>
                    <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black text-gray-600 hover:bg-gray-100 transition-all uppercase tracking-widest">
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Editar Plantilla
                    </button>
                </div>
            </div>
        );
    };

    if (isReconciled && cfdi) {
        const name = counterpart(cfdi) || '—';
        const confidenceScore = movement.confidence === 'green' ? 98 : (movement.confidence === 'yellow' ? 85 : 60);

        return (
            <div className="w-[420px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col h-full overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-500 text-base">verified</span>
                            Información de Conciliación
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
                    {/* Confidence Score */}
                    <div className="mb-6">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Confianza Contable</span>
                            <span className="text-lg font-black text-gray-900">{confidenceScore}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-1000 ${confidenceScore > 90 ? 'bg-emerald-500' : (confidenceScore > 80 ? 'bg-amber-400' : 'bg-red-400')
                                    }`}
                                style={{ width: `${confidenceScore}%` }}
                            />
                        </div>
                        <div className="flex gap-4 mt-3">
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 uppercase">
                                <span className="material-symbols-outlined text-[12px]">check_circle</span> RFC Coincide
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 uppercase">
                                <span className="material-symbols-outlined text-[12px]">check_circle</span> Monto Exacto
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-600 uppercase">
                                <span className="material-symbols-outlined text-[12px]">info</span> Fecha +/- {Math.abs(movement.suggestions?.[0]?.days_diff || 0)}d
                            </div>
                        </div>
                    </div>

                    {/* Linked CFDI Info */}
                    <div className="bg-emerald-50/30 rounded-3xl p-6 border border-emerald-100">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-widest">Factura Vinculada</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => onViewPdf(cfdi.uuid, name)}
                                    className="p-1.5 bg-white rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    title="Ver PDF"
                                >
                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                </button>
                                <button
                                    onClick={() => onDownloadPdf(cfdi.uuid)}
                                    className="p-1.5 bg-white rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    title="Descargar PDF"
                                >
                                    <span className="material-symbols-outlined text-sm">download</span>
                                </button>
                            </div>
                        </div>

                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">UUID: {cfdi.uuid}</p>
                        <h4 className="font-black text-gray-900 text-base leading-tight uppercase mb-4">{name}</h4>

                        <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">RFC Emisor</p>
                                <p className="text-xs font-bold text-gray-700 mt-0.5">{cfdi.rfc_emisor}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Fecha CFDI</p>
                                <p className="text-xs font-bold text-gray-700 mt-0.5">{formatDate(cfdi.fecha)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subtotal</p>
                                <p className="text-xs font-bold text-gray-700 mt-0.5">{fmt(cfdi.subtotal || 0)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
                                <p className="text-sm font-black text-gray-900 mt-0.5">{fmt(cfdi.total)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Método Pago</p>
                                <p className="text-xs font-bold text-gray-700 mt-0.5">{cfdi.metodo_pago || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Uso CFDI</p>
                                <p className="text-xs font-bold text-gray-700 mt-0.5">{cfdi.uso_cfdi || '—'}</p>
                            </div>
                        </div>
                    </div>

                    {renderPrePolicy()}
                </div>

                <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button
                        onClick={() => reconcileMovement(movement.id, 0, 'unlink').then(() => onReconciled({ ...movement, cfdi: null }))}
                        className="flex-1 py-3 border border-red-100 bg-red-50 text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-100 transition-all"
                    >
                        <span className="material-symbols-outlined text-base">link_off</span>
                        Desvincular
                    </button>
                    <button
                        onClick={() => onReconciled({ ...movement, cfdi: null })}
                        className="flex-1 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                    >
                        <span className="material-symbols-outlined text-base">swap_horiz</span>
                        Cambiar
                    </button>
                </div>
            </div>
        );
    }

    let filtered = [...allSuggestions];
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

    return (
        <div className="w-[420px] flex-shrink-0 bg-white border-l border-gray-100 flex flex-col h-full overflow-hidden shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    Vincular CFDI con Movimiento
                </h2>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            {/* Movement info */}
            <div className="mx-6 mt-6 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 flex-shrink-0">
                <span className="material-symbols-outlined text-blue-500 text-xl font-medium">info</span>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                    Buscando coincidencias para:{' '}
                    <strong className="text-gray-900 block font-black mt-1 uppercase">
                        {descTrunc} ({isEgreso ? '-' : '+'}{fmt(amount)})
                    </strong>
                </p>
            </div>

            {/* Search (sugerencias) / Manual search */}
            {!isManualMode ? (
                <>
                    <div className="px-6 mt-4 flex-shrink-0">
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
                    <div className="px-6 mt-4 flex gap-2 flex-shrink-0">
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
                <div className="px-6 mt-4 flex-shrink-0">
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

            {/* Suggestions list */}
            <div className="flex-1 overflow-y-auto px-6 mt-6 pb-4 space-y-6 scrollbar-hide">
                {isManualMode ? (
                    manualQuery.trim().length < 2 ? (
                        <div className="text-center py-16 flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-amber-200 mb-3">manage_search</span>
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Escribe al menos 2 caracteres</p>
                            <p className="text-[9px] text-gray-300 mt-1">UUID, RFC, nombre del proveedor</p>
                        </div>
                    ) : manualResults.length === 0 ? (
                        <div className="text-center py-16 flex flex-col items-center">
                            <span className="material-symbols-outlined text-5xl text-gray-200 mb-3">search_off</span>
                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Sin resultados</p>
                        </div>
                    ) : (
                        manualResults.map((cfdi) => {
                            const name = isEgreso ? (cfdi.name_emisor || cfdi.rfc_emisor) : (cfdi.name_receptor || cfdi.rfc_receptor);
                            const rfc = isEgreso ? cfdi.rfc_emisor : cfdi.rfc_receptor;
                            const isLoading = loadingId === cfdi.id;
                            return (
                                <div key={cfdi.id} className="relative rounded-[32px] border-2 border-amber-100 hover:border-amber-200 p-6 transition-all">
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
                                    {cfdi.forma_pago && (
                                        <span className="inline-block mt-3 text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-wider border border-blue-100">
                                            {cfdi.forma_pago}
                                        </span>
                                    )}
                                    <div className="flex justify-between items-end mt-6">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-1">Fecha Emisión</p>
                                            <p className="text-[11px] font-black text-gray-700">{formatDate(cfdi.fecha)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] mb-1">Total CFDI</p>
                                            <p className="text-xl font-black text-gray-900 tabular-nums">{fmt(cfdi.total)}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-6">
                                        <button
                                            onClick={() => onViewPdf(cfdi.uuid, name || cfdi.uuid)}
                                            className="w-12 h-12 flex items-center justify-center rounded-[18px] border border-gray-100 text-gray-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 transition-all flex-shrink-0"
                                            title="Ver PDF"
                                        >
                                            <span className="material-symbols-outlined text-lg">visibility</span>
                                        </button>
                                        <button
                                            onClick={() => handleConfirmManual(cfdi)}
                                            disabled={loadingId !== null}
                                            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[18px] font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 bg-amber-500 hover:bg-amber-600 text-white shadow-xl shadow-amber-100 border border-amber-400"
                                        >
                                            {isLoading
                                                ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                : <><span className="material-symbols-outlined text-base font-black">link</span>Asignar</>}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl text-gray-200">search_off</span>
                        </div>
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Sin coincidencias encontradas</p>
                    </div>
                ) : (
                    filtered.map((s, i) => {
                        const isBest = i === 0 && s.confidence === 'green';
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
                                className={`relative rounded-[32px] border-2 p-6 transition-all ${isBest ? 'border-emerald-500 shadow-xl shadow-emerald-50' : 'border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                {isBest && (
                                    <div className="absolute -top-3.5 left-6 bg-emerald-500 text-white text-[9px] font-black px-4 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-[0.15em] shadow-lg shadow-emerald-200">
                                        <span className="material-symbols-outlined text-[12px] font-black">star</span>
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
                                    <span className="inline-block mt-3 text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-wider border border-blue-100">
                                        {s.forma_pago}
                                    </span>
                                )}

                                {s.match_via === 'payment' && s.related_invoices && s.related_invoices.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-1.5 items-center">
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

                                <div className="flex justify-between items-end mt-6">
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

                                <div className="flex gap-2 mt-6">
                                    <button
                                        onClick={() => onViewPdf(s.uuid, name)}
                                        className="w-12 h-12 flex items-center justify-center rounded-[18px] border border-gray-100 text-gray-400 hover:text-blue-500 hover:border-blue-100 hover:bg-blue-50 transition-all flex-shrink-0"
                                        title="Ver PDF"
                                    >
                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                    </button>
                                    <button
                                        onClick={() => handleConfirm(s)}
                                        disabled={loadingId !== null}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-[18px] font-black text-[11px] uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-50 ${isBest
                                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-100 border border-emerald-400'
                                            : 'bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-100 hover:border-gray-200'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-base font-black">
                                                    {isBest ? 'check_circle' : 'link'}
                                                </span>
                                                Vincular Factura
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
                            Asignar manualmente
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
