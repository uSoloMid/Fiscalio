import { useState } from 'react';
import { reconcileMovement, exportCfdiPdf } from '../services';
import type { BankMovement, ReconciliationSuggestion } from '../models';

interface Props {
    movement: BankMovement;
    onClose: () => void;
    onReconciled: (updated: BankMovement) => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

type FilterChip = 'monto' | 'fecha' | 'rfc';

export function ReconciliationSidebar({ movement, onClose, onReconciled }: Props) {
    const [search, setSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<FilterChip>>(new Set(['monto']));
    const [loadingId, setLoadingId] = useState<number | null>(null);

    const isEgreso = movement.cargo > 0;
    const amount = isEgreso ? movement.cargo : movement.abono;
    const allSuggestions: ReconciliationSuggestion[] = movement.suggestions ?? [];

    const counterpart = (s: ReconciliationSuggestion) =>
        isEgreso ? (s.name_emisor || s.rfc_emisor) : (s.name_receptor || s.rfc_receptor);
    const counterpartRfc = (s: ReconciliationSuggestion) =>
        isEgreso ? s.rfc_emisor : s.rfc_receptor;

    const toggleFilter = (f: FilterChip) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            next.has(f) ? next.delete(f) : next.add(f);
            return next;
        });
    };

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

    if (activeFilters.has('fecha')) {
        filtered = [...filtered].sort((a, b) => a.days_diff - b.days_diff);
    }

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

    return (
        <div className="w-96 flex-shrink-0 bg-white border-l border-gray-100 flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                    Vincular CFDI con Movimiento
                </h2>
                <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>
            </div>

            {/* Movement info */}
            <div className="mx-4 mt-4 p-3 bg-blue-50 rounded-xl flex gap-2.5 flex-shrink-0">
                <span className="material-symbols-outlined text-blue-400 text-base mt-0.5 flex-shrink-0">info</span>
                <p className="text-xs text-gray-600 leading-relaxed">
                    Buscando coincidencias para:{' '}
                    <strong className="text-gray-900">
                        {descTrunc} ({isEgreso ? '-' : '+'}{fmt(amount)})
                    </strong>
                </p>
            </div>

            {/* Search */}
            <div className="px-4 mt-3 flex-shrink-0">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="material-symbols-outlined text-gray-400 text-base">search</span>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por Folio, RFC o Monto..."
                        className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none"
                    />
                </div>
            </div>

            {/* Filter chips */}
            <div className="px-4 mt-3 flex gap-2 flex-shrink-0">
                {([
                    { key: 'monto' as FilterChip, label: 'Mismo monto' },
                    { key: 'fecha' as FilterChip, label: 'Fecha próxima' },
                    { key: 'rfc' as FilterChip, label: 'RFC frecuente' },
                ]).map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                            activeFilters.has(key)
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Suggestions list */}
            <div className="flex-1 overflow-y-auto px-4 mt-4 pb-2 space-y-4">
                {filtered.length === 0 ? (
                    <div className="text-center py-10">
                        <span className="material-symbols-outlined text-4xl text-gray-200 block mb-2">search_off</span>
                        <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Sin coincidencias</p>
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
                                className={`relative rounded-2xl border-2 p-4 ${
                                    isBest ? 'border-emerald-500' : 'border-gray-100'
                                }`}
                            >
                                {/* Best match badge */}
                                {isBest && (
                                    <div className="absolute -top-3.5 left-4 bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full flex items-center gap-1 uppercase tracking-widest">
                                        <span className="material-symbols-outlined text-[11px]">star</span>
                                        Mejor coincidencia
                                    </div>
                                )}

                                {/* Tipo/UUID + VIGENTE */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                        {tipoLabel}: {s.uuid.slice(0, 8)}…
                                    </span>
                                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        VIGENTE
                                    </span>
                                </div>

                                {/* Company + RFC */}
                                <p className="font-black text-gray-900 text-sm leading-tight uppercase truncate">{name}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">RFC: {rfc}</p>

                                {/* Forma de pago */}
                                {s.forma_pago && (
                                    <span className="inline-block mt-1.5 text-[9px] font-black text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded uppercase">
                                        {s.forma_pago}
                                    </span>
                                )}

                                {/* Related invoices (REP) */}
                                {s.match_via === 'payment' && s.related_invoices && s.related_invoices.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1 items-center">
                                        <span className="text-[9px] font-black text-purple-500 uppercase">
                                            {s.payments_count ?? s.related_invoices.length} factura{(s.payments_count ?? s.related_invoices.length) !== 1 ? 's' : ''}:
                                        </span>
                                        {s.related_invoices.slice(0, 3).map((uuid, j) => (
                                            <span key={j} className="text-[9px] font-black text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded">
                                                {uuid.slice(0, 8)}…
                                            </span>
                                        ))}
                                        {s.related_invoices.length > 3 && (
                                            <span className="text-[9px] font-black text-purple-300">+{s.related_invoices.length - 3}</span>
                                        )}
                                    </div>
                                )}

                                {/* Date + Total */}
                                <div className="flex justify-between items-end mt-3">
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                            {s.match_via === 'payment' ? 'Fecha Pago' : 'Fecha Emisión'}
                                        </p>
                                        <p className="text-xs font-semibold text-gray-700 mt-0.5">{dateDisplay}</p>
                                        {s.days_diff > 0 && (
                                            <p className="text-[9px] text-gray-400 mt-0.5">+{s.days_diff} días</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total CFDI</p>
                                        <p className="text-xl font-black text-gray-900">{fmt(s.total)}</p>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={() => exportCfdiPdf(s.uuid)}
                                        className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-all flex-shrink-0"
                                        title="Ver PDF"
                                    >
                                        <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                                    </button>
                                    <button
                                        onClick={() => handleConfirm(s)}
                                        disabled={loadingId !== null}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                                            isBest
                                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-100'
                                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        }`}
                                    >
                                        {isLoading ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <span className="material-symbols-outlined text-base">
                                                {isBest ? 'check_circle' : 'link'}
                                            </span>
                                        )}
                                        Vincular Factura
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-5 py-4 text-center flex-shrink-0">
                <p className="text-xs text-gray-400">¿No encuentras la factura?</p>
                <button className="mt-1 flex items-center gap-1.5 mx-auto text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                    <span className="material-symbols-outlined text-base">upload_file</span>
                    Subir archivo XML manualmente
                </button>
            </div>
        </div>
    );
}
