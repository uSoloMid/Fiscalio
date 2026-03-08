import { useState } from 'react';
import { unreconcileMovement, exportCfdiPdf } from '../services';
import type { BankMovement } from '../models';

interface Props {
    movement: BankMovement;
    isSelected: boolean;
    onSelect: (movement: BankMovement) => void;
    onUnreconciled: (movementId: number) => void;
    gridTemplate?: string;
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

// Normalize names from Banamex format: "NOMBRE,APELLIDO/APELLIDO2" → "NOMBRE APELLIDO APELLIDO2"
const cleanName = (raw: string) =>
    raw.replace(/,/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

// Extract the most meaningful counterpart or category from a bank description
function parseMovementDisplay(description: string, isEgreso: boolean): { main: string; sub?: string } {
    const d = description.trim();

    // BBVA SPEI enviado (T17) / recibido (T20): name is always at the very end after last long code
    if (/^T\d{2} SPEI (ENVIADO|RECIBIDO)/i.test(d)) {
        const m = d.match(/[A-Z0-9]{7,}\s+([A-ZÁÉÍÓÚÜÑ,/][A-ZÁÉÍÓÚÜÑ,/ ]{2,})$/i);
        if (m) {
            const label = /T20/.test(d) ? 'SPEI Recibido' : 'SPEI Enviado';
            return { main: cleanName(m[1]), sub: label };
        }
    }

    // Banamex SPEI recibido: "PAGO RECIBIDO DE X POR ORDEN DE Y CTA./REF."
    const porOrdenDe = d.match(/POR ORDEN DE ([A-ZÁÉÍÓÚÜÑ0-9 ,.']+?) (?:CTA\.|REF\.|RASTREO|SU REF)/i);
    if (porOrdenDe) return { main: porOrdenDe[1].trim(), sub: 'SPEI Recibido' };

    // Banamex SPEI recibido without CTA/REF suffix (name at end after SU REF)
    if (/PAGO RECIBIDO DE/.test(d) && !porOrdenDe) {
        const m2 = d.match(/POR ORDEN DE ([A-ZÁÉÍÓÚÜÑ0-9 ,.'-]+?)(?:\s+CTA\.|\s+REF\.|\s+RASTREO|$)/i);
        if (m2) return { main: m2[1].trim(), sub: 'SPEI Recibido' };
    }

    // Banamex SPEI enviado: "AL BENEF. NOMBRE,APELLIDO/APELLIDO ..."
    const alBenef = d.match(/AL BENEF[.\s]+([A-ZÁÉÍÓÚÜÑ ,/]+?)(?:\s*\(|\s*CTA\.|\s*SU REF)/i);
    if (alBenef) return { main: cleanName(alBenef[1]), sub: 'SPEI Enviado' };

    // BBVA POS terminal: "A15 COMERCIO RFC: ..."
    const posBBVA = d.match(/^[A-Z]\d{2} (.+?) RFC:/i);
    if (posBBVA) return { main: posBBVA[1].trim(), sub: 'TPV' };

    // BBVA N06 payment to third party (extract concept between account# and Ref.)
    const n06 = d.match(/N06 PAGO CUENTA DE TERCERO \S+ (.{2,30}?) Ref\./i);
    if (n06) return { main: n06[1].trim(), sub: isEgreso ? 'Pago Tercero' : 'Cobro Tercero' };

    // TPV sales (Jesús patterns)
    if (/VENTAS (CREDITO|DEBITO|TDC INTER)|VENTA NAL\. AMEX/i.test(d))
        return { main: 'Cobro TPV', sub: 'Terminal Punto de Venta' };
    if (/COMISION VENTAS|COM\. VTA\. NAL\. AMEX|COM VTAS TDC/i.test(d))
        return { main: 'Comisión TPV' };
    if (/IVA COM\.? VENTAS|IVA COM VTAS|IVA TRANSACCION|CUOTA TRANSACCION/i.test(d))
        return { main: 'IVA / TPV' };

    // Banamex service payments: "PAGO DE SERVICIO NUM CONCEPTO"
    const pagoServicio = d.match(/PAGO DE SERVICIO \d+ (.+)$/i);
    if (pagoServicio) return { main: pagoServicio[1].trim() };

    // Cash deposits
    if (/DEPOSITO SALVO BUEN COBRO/i.test(d)) {
        const suc = d.match(/SUC\. (.+?)(?:,|$)/i);
        return { main: 'Depósito', sub: suc ? suc[1].trim() : undefined };
    }
    if (/DEPOSITO (EFECTIVO|DE SUC\.|EN EFECTIVO)/i.test(d) || /DEPOSITO EFECTIVO/i.test(d))
        return { main: 'Depósito Efectivo' };

    // Bank fees/commissions
    if (/COBRO.*COM.*CUOT|COMISION ADMINISTRACION PAQUETE/i.test(d))
        return { main: 'Comisión Bancaria' };
    if (/IVA COMISION ADMINISTRACION/i.test(d))
        return { main: 'IVA Comisión Bancaria' };

    // SAT tax payments
    if (/PAGO DE IMPUESTOS REFERENCIADO|S\.A\.T\./i.test(d))
        return { main: 'Pago SAT' };

    // Internal transfer
    if (/^TRASPASO/i.test(d)) return { main: 'Traspaso' };

    // BBVA recurring / insurance
    if (/K45 PAGO RECURRENTE/i.test(d)) return { main: 'Pago Recurrente' };
    if (/G08 PAGO AUTOSEGURO/i.test(d)) return { main: 'Seguro Flotilla' };
    if (/S39 SERV BANCA INTERNET/i.test(d)) return { main: 'Banca en Línea' };
    if (/S40 IVA COM SERV BCA/i.test(d)) return { main: 'IVA Banca en Línea' };

    // Cheque
    if (/COBRO DE CHEQUE/i.test(d)) return { main: 'Cobro de Cheque' };

    // Fallback: truncate raw description
    return { main: d.length > 38 ? d.slice(0, 38).trimEnd() + '…' : d };
}

export function MovementReconcileRow({ movement, isSelected, onSelect, onUnreconciled, gridTemplate }: Props) {
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

    const isEgreso = movement.cargo > 0;
    const parsed = parseMovementDisplay(movement.description, isEgreso);

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
                style={{ gridTemplateColumns: gridTemplate ?? '90px 2fr 1fr 1fr 1fr 48px' }}
                className={`grid gap-0 items-stretch transition-colors ${
                    !isReconciled ? 'cursor-pointer hover:bg-gray-50/60' : 'cursor-default'
                }`}
                onClick={() => !isReconciled && onSelect(movement)}
            >
                {/* Date */}
                <div className="px-4 py-4 border-r border-gray-50">
                    <p className="text-sm font-black text-gray-800">{day} {month}</p>
                    <p className="text-[10px] font-medium text-gray-400">{year}</p>
                </div>

                {/* Description — parsed counterpart */}
                <div title={movement.description} className="px-3 py-4 border-r border-gray-50 min-w-0 flex flex-col justify-center">
                    <p className="text-xs font-black text-gray-800 leading-tight truncate uppercase">{parsed.main}</p>
                    {parsed.sub && (
                        <p className="text-[10px] font-medium text-gray-400 mt-0.5 truncate uppercase">{parsed.sub}</p>
                    )}
                </div>

                {/* Cargo */}
                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-end">
                    {movement.cargo > 0 ? (
                        <span className="text-base font-black text-red-500 tabular-nums">
                            -{fmt(movement.cargo)}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-gray-200">—</span>
                    )}
                </div>

                {/* Abono */}
                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-end">
                    {movement.abono > 0 ? (
                        <span className="text-base font-black text-emerald-600 tabular-nums">
                            +{fmt(movement.abono)}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-gray-200">—</span>
                    )}
                </div>

                {/* Estado */}
                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-start">
                    {estadoBadge}
                </div>

                {/* Actions */}
                <div className="px-2 py-4 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
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
