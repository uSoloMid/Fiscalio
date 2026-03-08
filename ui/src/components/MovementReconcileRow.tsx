import { useState } from 'react';
import { unreconcileMovement, exportCfdiPdf } from '../services';
import type { BankMovement } from '../models';

interface Props {
    movement: BankMovement;
    isSelected: boolean;
    onSelect: (movement: BankMovement) => void;
    onUnreconciled: (movementId: number) => void;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const getDateParts = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: MONTHS_SHORT[d.getMonth()] ?? '',
        year: String(d.getFullYear()),
    };
};

export function MovementReconcileRow({ movement, isSelected, onSelect, onUnreconciled }: Props) {
    const [loadingUnlink, setLoadingUnlink] = useState(false);

    const isReconciled = !!movement.cfdi_id;
    const suggestions = movement.suggestions ?? [];
    const previewConfidence = movement._confidence_preview ?? suggestions[0]?.confidence;
    const hasSuggestions = suggestions.length > 0;

    // Left border color by confidence
    const borderColor = isReconciled
        ? 'border-l-emerald-400'
        : previewConfidence === 'green'  ? 'border-l-emerald-400'
        : previewConfidence === 'yellow' ? 'border-l-amber-400'
        : previewConfidence === 'red'    ? 'border-l-red-400'
        : 'border-l-transparent';

    // Row background
    const rowBg = isSelected
        ? 'bg-emerald-50/40'
        : isReconciled
        ? 'bg-emerald-50/20'
        : !hasSuggestions
        ? 'bg-red-50/10'
        : '';

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

    const { day, month, year } = getDateParts(movement.date);

    // Truncate description
    const desc = movement.description.length > 40
        ? movement.description.slice(0, 40).trimEnd() + '…'
        : movement.description;

    // Estado badge — prominent with icon
    const estadoBadge = isReconciled ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            Conciliado
        </span>
    ) : hasSuggestions ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <span className="material-symbols-outlined text-[13px]">pending</span>
            Pendiente
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 text-xs font-black text-red-600 bg-red-100 border border-red-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
            <span className="material-symbols-outlined text-[13px]">warning</span>
            Sin Match
        </span>
    );

    return (
        <div className={`border-b border-gray-50 last:border-0 border-l-4 transition-colors ${borderColor} ${rowBg}`}>
            <div
                className={`grid grid-cols-[90px_1fr_120px_120px_120px_150px_48px] gap-3 items-center px-6 py-4 transition-colors ${
                    !isReconciled ? 'cursor-pointer hover:bg-gray-50/60' : 'cursor-default'
                }`}
                onClick={() => !isReconciled && onSelect(movement)}
            >
                {/* Date */}
                <div>
                    <p className="text-sm font-black text-gray-800">{day} {month}</p>
                    <p className="text-[10px] font-medium text-gray-400">{year}</p>
                </div>

                {/* Description + reference */}
                <div title={movement.description} className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 leading-tight truncate uppercase">{desc}</p>
                    {movement.reference && (
                        <p className="text-[10px] font-medium text-gray-400 mt-0.5 truncate">{movement.reference}</p>
                    )}
                </div>

                {/* Referencia (extra column — kept for accounting context) */}
                <div className="hidden" />

                {/* Cargo */}
                <div className="text-right">
                    {movement.cargo > 0 ? (
                        <span className="text-base font-black text-red-500 tabular-nums">
                            -{fmt(movement.cargo)}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-gray-200">—</span>
                    )}
                </div>

                {/* Abono */}
                <div className="text-right">
                    {movement.abono > 0 ? (
                        <span className="text-base font-black text-emerald-600 tabular-nums">
                            +{fmt(movement.abono)}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-gray-200">—</span>
                    )}
                </div>

                {/* Estado */}
                <div className="flex justify-start">
                    {estadoBadge}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {isReconciled ? (
                        <>
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
                    ) : hasSuggestions ? (
                        <span className="material-symbols-outlined text-base text-gray-300">chevron_right</span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
