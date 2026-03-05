import { useState } from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { reconcileMovement, unreconcileMovement, exportCfdiPdf } from '../services';
import type { BankMovement, ReconciliationSuggestion } from '../models';

interface Props {
    movement: BankMovement;
    onReconciled: (updated: BankMovement) => void;
    onUnreconciled: (movementId: number) => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

export function MovementReconcileRow({ movement, onReconciled, onUnreconciled }: Props) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [loadingId, setLoadingId] = useState<number | null>(null);
    const [loadingUnlink, setLoadingUnlink] = useState(false);

    const suggestions: ReconciliationSuggestion[] = movement.suggestions ?? [];
    const isReconciled = !!movement.cfdi_id;
    const amount = movement.cargo > 0 ? movement.cargo : movement.abono;
    const isEgreso = movement.cargo > 0;

    const handleConfirm = async (s: ReconciliationSuggestion) => {
        setLoadingId(s.cfdi_id);
        try {
            const res = await reconcileMovement(movement.id, s.cfdi_id, s.confidence);
            onReconciled({ ...res.movement, suggestions: [] });
        } catch (e) {
            console.error(e);
            alert('Error al conciliar. Revisa la consola del servidor.');
        } finally {
            setLoadingId(null);
            setIsExpanded(false);
        }
    };

    const handleUnlink = async () => {
        setLoadingUnlink(true);
        try {
            await unreconcileMovement(movement.id);
            onUnreconciled(movement.id);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingUnlink(false);
        }
    };

    const counterpart = (s: ReconciliationSuggestion) =>
        isEgreso ? (s.name_emisor || s.rfc_emisor) : (s.name_receptor || s.rfc_receptor);

    const previewConfidence = movement._confidence_preview ?? (suggestions[0]?.confidence ?? (suggestions.length === 0 ? 'black' : undefined));

    const borderColor = isReconciled
        ? 'border-l-emerald-400'
        : previewConfidence === 'green'  ? 'border-l-emerald-400'
        : previewConfidence === 'yellow' ? 'border-l-yellow-400'
        : previewConfidence === 'red'    ? 'border-l-red-400'
        : 'border-l-transparent';

    const shortDesc = movement.description.length > 65
        ? movement.description.slice(0, 65).trimEnd() + '…'
        : movement.description;

    return (
        <div className={`border-b border-gray-50 last:border-0 border-l-4 transition-colors ${borderColor} ${isReconciled ? 'bg-emerald-50/20' : ''}`}>
            {/* Main row */}
            <div
                className={`grid grid-cols-[130px_1fr_140px_140px_140px_200px] gap-2 items-center px-8 py-4 ${!isReconciled ? 'cursor-pointer hover:bg-gray-50/80' : ''}`}
                onClick={() => !isReconciled && setIsExpanded(p => !p)}
            >
                {/* Date */}
                <span className="text-xs font-black text-gray-400 uppercase">{movement.date}</span>

                {/* Description */}
                <div title={movement.description}>
                    <p className="text-xs font-bold text-gray-900 uppercase leading-tight">{shortDesc}</p>
                    {movement.reference && (
                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{movement.reference}</span>
                    )}
                </div>

                {/* Cargo */}
                <span className={`text-sm font-black text-right ${movement.cargo > 0 ? 'text-red-500' : 'text-gray-200'}`}>
                    {movement.cargo > 0 ? `-${fmt(movement.cargo)}` : '—'}
                </span>

                {/* Abono */}
                <span className={`text-sm font-black text-right ${movement.abono > 0 ? 'text-emerald-600' : 'text-gray-200'}`}>
                    {movement.abono > 0 ? `+${fmt(movement.abono)}` : '—'}
                </span>

                {/* Confidence badge */}
                <div className="flex justify-center">
                    {isReconciled
                        ? <ConfidenceBadge confidence={movement.confidence ?? 'green'} />
                        : previewConfidence
                            ? <ConfidenceBadge confidence={previewConfidence} />
                            : null
                    }
                </div>

                {/* Action / linked CFDI */}
                <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    {isReconciled ? (
                        <>
                            <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 truncate max-w-[100px]">
                                {movement.cfdi?.uuid?.slice(0, 8)}…
                            </span>
                            {movement.cfdi?.uuid && (
                                <button
                                    onClick={() => exportCfdiPdf(movement.cfdi!.uuid!)}
                                    title="Ver PDF"
                                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                >
                                    <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                                </button>
                            )}
                            <button
                                onClick={handleUnlink}
                                disabled={loadingUnlink}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Desvincular"
                            >
                                {loadingUnlink
                                    ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                    : <span className="material-symbols-outlined text-base">link_off</span>
                                }
                            </button>
                        </>
                    ) : (
                        suggestions.length > 0 ? (
                            <button
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isExpanded ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                <span className="material-symbols-outlined text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                {suggestions.length} opción{suggestions.length > 1 ? 'es' : ''}
                            </button>
                        ) : (
                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Sin match</span>
                        )
                    )}
                </div>
            </div>

            {/* Expanded suggestions panel */}
            {isExpanded && !isReconciled && suggestions.length > 0 && (
                <div className="mx-8 mb-4 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            Sugerencias para {isEgreso ? 'CARGO' : 'ABONO'} de {fmt(amount)}
                        </span>
                        <button onClick={() => setIsExpanded(false)} className="text-gray-300 hover:text-gray-500">
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {suggestions.map((s, i) => (
                            <div key={i} className="px-5 py-3 flex items-center gap-4 hover:bg-white transition-colors">
                                <ConfidenceBadge confidence={s.confidence} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-900 uppercase truncate">{counterpart(s)}</p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        {s.match_via === 'payment' && s.fecha_pago ? (
                                            <span className="text-[9px] font-black text-gray-400">
                                                <span className="text-gray-300 font-medium">Pago: </span>{s.fecha_pago}
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black text-gray-400">{s.fecha?.slice(0, 10)}</span>
                                        )}
                                        {s.days_diff > 0 && (
                                            <span className="text-[9px] font-black text-gray-300">+{s.days_diff}d</span>
                                        )}
                                        <span className="text-[9px] font-black text-gray-400 uppercase">{s.match_via === 'payment' ? 'REP' : s.tipo}</span>
                                        {s.match_via === 'payment' && s.forma_pago && (
                                            <span className="text-[9px] font-black text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded uppercase">{s.forma_pago}</span>
                                        )}
                                        <span className="text-[9px] font-black text-gray-300 truncate">{s.uuid?.slice(0, 12)}…</span>
                                    </div>
                                    {/* Related invoices for REP */}
                                    {s.match_via === 'payment' && s.related_invoices && s.related_invoices.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest">
                                                {s.payments_count ?? s.related_invoices.length} factura{(s.payments_count ?? s.related_invoices.length) > 1 ? 's' : ''}:
                                            </span>
                                            {s.related_invoices.slice(0, 4).map((uuid, j) => (
                                                <span key={j} className="text-[8px] font-black text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded">
                                                    {uuid.slice(0, 8)}…
                                                </span>
                                            ))}
                                            {s.related_invoices.length > 4 && (
                                                <span className="text-[8px] font-black text-purple-300">+{s.related_invoices.length - 4}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm font-black text-gray-900 whitespace-nowrap">{fmt(s.total)}</span>
                                <button
                                    onClick={() => exportCfdiPdf(s.uuid)}
                                    title="Ver PDF"
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                                >
                                    <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                                </button>
                                <button
                                    onClick={() => handleConfirm(s)}
                                    disabled={loadingId !== null}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                                >
                                    {loadingId === s.cfdi_id
                                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        : <span className="material-symbols-outlined text-sm">check</span>
                                    }
                                    Confirmar
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
