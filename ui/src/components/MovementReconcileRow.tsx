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

    const borderColor = isReconciled
        ? 'border-l-emerald-400'
        : previewConfidence === 'green'  ? 'border-l-emerald-400'
        : previewConfidence === 'yellow' ? 'border-l-yellow-400'
        : previewConfidence === 'red'    ? 'border-l-red-400'
        : 'border-l-transparent';

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

    // Estado badge
    const estadoBadge = isReconciled ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            Conciliado
        </span>
    ) : suggestions.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
            Pendiente
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            Sin Match
        </span>
    );

    return (
        <div className={`border-b border-gray-50 last:border-0 border-l-4 transition-colors ${borderColor} ${
            isSelected ? 'bg-emerald-50/30' : isReconciled ? 'bg-emerald-50/10' : ''
        }`}>
            <div
                className={`grid grid-cols-[90px_1fr_130px_110px_110px_130px_36px] gap-2 items-center px-6 py-3.5 transition-colors ${
                    !isReconciled ? 'cursor-pointer hover:bg-gray-50/80' : 'cursor-default'
                }`}
                onClick={() => !isReconciled && onSelect(movement)}
            >
                {/* Date */}
                <div>
                    <p className="text-xs font-bold text-gray-800">{day} {month}</p>
                    <p className="text-[10px] font-medium text-gray-400">{year}</p>
                </div>

                {/* Description */}
                <div title={movement.description}>
                    <p className="text-xs font-bold text-gray-900 leading-tight truncate uppercase">
                        {movement.description}
                    </p>
                </div>

                {/* Reference */}
                <span className="text-[11px] font-medium text-gray-400 truncate">
                    {movement.reference || '—'}
                </span>

                {/* Cargo */}
                <span className={`text-sm font-bold text-right tabular-nums ${movement.cargo > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                    {movement.cargo > 0 ? `-${fmt(movement.cargo)}` : '$0.00'}
                </span>

                {/* Abono */}
                <span className={`text-sm font-bold text-right tabular-nums ${movement.abono > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {movement.abono > 0 ? `+${fmt(movement.abono)}` : '$0.00'}
                </span>

                {/* Estado */}
                <div className="flex justify-start">
                    {estadoBadge}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                    {isReconciled ? (
                        <div className="flex items-center gap-1">
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
                        </div>
                    ) : suggestions.length > 0 ? (
                        <span className="material-symbols-outlined text-base text-gray-300">chevron_right</span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
