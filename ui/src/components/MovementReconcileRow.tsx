import { useState } from 'react';
import { unreconcileMovement } from '../services';
import type { BankMovement } from '../models';

interface Props {
    movement: BankMovement;
    isSelected: boolean;
    onSelect: (movement: BankMovement) => void;
    onUnreconciled: (movementId: number) => void;
    onViewPdf: (uuid: string, title: string) => void;
    onDownloadPdf: (uuid: string) => void;
    gridTemplate?: string;
}

const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const getDateParts = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: MONTHS_SHORT[d.getMonth()] ?? '',
        year: String(d.getFullYear()),
    };
};

const cleanName = (raw: string) =>
    raw.replace(/,/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

function parseMovementDisplay(description: string, isEgreso: boolean): { main: string; sub?: string } {
    const d = description.trim();
    if (/^T\d{2} SPEI (ENVIADO|RECIBIDO)/i.test(d)) {
        const m = d.match(/[A-Z0-9]{7,}\s+([A-ZÁÉÍÓÚÜÑ,/][A-ZÁÉÍÓÚÜÑ,/ ]{2,})$/i);
        if (m) {
            const label = /T20/.test(d) ? 'SPEI Recibido' : 'SPEI Enviado';
            return { main: cleanName(m[1]), sub: label };
        }
    }
    const porOrdenDe = d.match(/POR ORDEN DE ([A-ZÁÉÍÓÚÜÑ0-9 ,.']+?) (?:CTA\.|REF\.|RASTREO|SU REF)/i);
    if (porOrdenDe) return { main: porOrdenDe[1].trim(), sub: 'SPEI Recibido' };
    if (/PAGO RECIBIDO DE/.test(d) && !porOrdenDe) {
        const m2 = d.match(/POR ORDEN DE ([A-ZÁÉÍÓÚÜÑ0-9 ,.'-]+?)(?:\s+CTA\.|\s+REF\.|\s+RASTREO|$)/i);
        if (m2) return { main: m2[1].trim(), sub: 'SPEI Recibido' };
    }
    const alBenef = d.match(/AL BENEF[.\s]+([A-ZÁÉÍÓÚÜÑ ,/]+?)(?:\s*\(|\s*CTA\.|\s*SU REF)/i);
    if (alBenef) return { main: cleanName(alBenef[1]), sub: 'SPEI Enviado' };
    const posBBVA = d.match(/^[A-Z]\d{2} (.+?) RFC:/i);
    if (posBBVA) return { main: posBBVA[1].trim(), sub: 'TPV' };
    const n06 = d.match(/N06 PAGO CUENTA DE TERCERO \S+ (.{2,30}?) Ref\./i);
    if (n06) return { main: n06[1].trim(), sub: isEgreso ? 'Pago Tercero' : 'Cobro Tercero' };
    if (/VENTAS (CREDITO|DEBITO|TDC INTER)|VENTA NAL\. AMEX/i.test(d))
        return { main: 'Cobro TPV', sub: 'Terminal Punto de Venta' };
    if (/COMISION VENTAS|COM\. VTA\. NAL\. AMEX|COM VTAS TDC/i.test(d))
        return { main: 'Comisión TPV' };
    if (/IVA COM\.? VENTAS|IVA COM VTAS|IVA TRANSACCION|CUOTA TRANSACCION/i.test(d))
        return { main: 'IVA / TPV' };
    const pagoServicio = d.match(/PAGO DE SERVICIO \d+ (.+)$/i);
    if (pagoServicio) return { main: pagoServicio[1].trim() };
    if (/DEPOSITO SALVO BUEN COBRO/i.test(d)) {
        const suc = d.match(/SUC\. (.+?)(?:,|$)/i);
        return { main: 'Depósito', sub: suc ? suc[1].trim() : undefined };
    }
    if (/DEPOSITO (EFECTIVO|DE SUC\.|EN EFECTIVO)/i.test(d) || /DEPOSITO EFECTIVO/i.test(d))
        return { main: 'Depósito Efectivo' };
    if (/COBRO.*COM.*CUOT|COMISION ADMINISTRACION PAQUETE/i.test(d))
        return { main: 'Comisión Bancaria' };
    if (/IVA COMISION ADMINISTRACION/i.test(d))
        return { main: 'IVA Comisión Bancaria' };
    if (/PAGO DE IMPUESTOS REFERENCIADO|S\.A\.T\./i.test(d))
        return { main: 'Pago SAT' };
    if (/^TRASPASO/i.test(d)) return { main: 'Traspaso' };
    if (/K45 PAGO RECURRENTE/i.test(d)) return { main: 'Pago Recurrente' };
    if (/G08 PAGO AUTOSEGURO/i.test(d)) return { main: 'Seguro Flotilla' };
    if (/S39 SERV BANCA INTERNET/i.test(d)) return { main: 'Banca en Línea' };
    if (/S40 IVA COM SERV BCA/i.test(d)) return { main: 'IVA Banca en Línea' };
    if (/COBRO DE CHEQUE/i.test(d)) return { main: 'Cobro de Cheque' };
    return { main: d.length > 38 ? d.slice(0, 38).trimEnd() + '…' : d };
}

export function MovementReconcileRow({ movement, isSelected, onSelect, onUnreconciled, onViewPdf, gridTemplate }: Props) {
    const [loadingUnlink, setLoadingUnlink] = useState(false);

    const linkedCfdis = movement.cfdis ?? (movement.cfdi ? [movement.cfdi] : []);
    const isReconciled = linkedCfdis.length > 0;
    const suggestions = movement.suggestions ?? [];
    const previewConfidence = movement._confidence_preview ?? suggestions[0]?.confidence;
    const hasSuggestions = suggestions.length > 0;

    const borderColor = isReconciled
        ? 'border-l-emerald-400'
        : previewConfidence === 'green' ? 'border-l-emerald-400'
            : previewConfidence === 'yellow' ? 'border-l-amber-400'
                : previewConfidence === 'red' ? 'border-l-red-400'
                    : 'border-l-transparent';

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
            await unreconcileMovement(movement.id); // unlink all
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

    const estadoBadge = isReconciled ? (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-xl whitespace-nowrap uppercase tracking-widest">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            {linkedCfdis.length > 1 ? `${linkedCfdis.length} facturas` : 'OK'}
        </span>
    ) : hasSuggestions ? (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-xl whitespace-nowrap uppercase tracking-widest">
            <span className="material-symbols-outlined text-[12px]">pending</span>
            Pendiente
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-red-600 bg-red-100 border border-red-200 px-2.5 py-1 rounded-xl whitespace-nowrap uppercase tracking-widest">
            <span className="material-symbols-outlined text-[12px]">warning</span>
            Sin Match
        </span>
    );

    // First linked CFDI for display
    const cfdi = linkedCfdis[0] ?? movement.cfdi ?? null;
    const counterpartRfc = isEgreso ? cfdi?.rfc_emisor : cfdi?.rfc_receptor;
    const counterpartName = isEgreso ? cfdi?.name_emisor : cfdi?.name_receptor;

    return (
        <div className={`border-b border-gray-50 last:border-0 border-l-4 transition-colors ${borderColor} ${rowBg}`}>
            <div
                style={{ gridTemplateColumns: gridTemplate ?? '90px 280px 120px 120px 60px 100px 240px 140px 64px' }}
                className="grid gap-0 items-stretch transition-colors cursor-pointer hover:bg-gray-50/60"
                onClick={() => onSelect(movement)}
            >
                <div className="px-4 py-4 border-r border-gray-50">
                    <p className="text-sm font-black text-gray-800">{day} {month}</p>
                    <p className="text-[10px] font-medium text-gray-400">{year}</p>
                </div>

                <div title={movement.description} className="px-3 py-4 border-r border-gray-50 min-w-0 flex flex-col justify-center">
                    <p className="text-xs font-black text-gray-800 leading-tight truncate uppercase">{parsed.main}</p>
                    {parsed.sub && (
                        <p className="text-[10px] font-medium text-gray-400 mt-0.5 truncate uppercase">{parsed.sub}</p>
                    )}
                </div>

                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-end">
                    {movement.cargo > 0 ? (
                        <span className="text-sm font-black text-red-500 tabular-nums">-{fmt(movement.cargo)}</span>
                    ) : (
                        <span className="text-sm font-medium text-gray-100">—</span>
                    )}
                </div>

                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-end">
                    {movement.abono > 0 ? (
                        <span className="text-sm font-black text-emerald-600 tabular-nums">+{fmt(movement.abono)}</span>
                    ) : (
                        <span className="text-sm font-medium text-gray-100">—</span>
                    )}
                </div>

                {/* TIPO */}
                <div className="px-3 py-4 border-r border-gray-50 flex flex-col justify-center items-center">
                    {isReconciled && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${cfdi?.tipo === 'P' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                            {cfdi?.tipo === 'P' ? 'REP' : (cfdi?.metodo_pago || '—')}
                        </span>
                    )}
                </div>

                {/* FORMA PAGO */}
                <div className="px-3 py-4 border-r border-gray-50 flex flex-col justify-center">
                    {isReconciled && (
                        <p className="text-[10px] font-bold text-gray-500 text-center truncate" title={cfdi?.forma_pago}>
                            {cfdi?.forma_pago || '—'}
                        </p>
                    )}
                </div>

                {/* RFC / RAZON SOCIAL */}
                <div className="px-3 py-4 border-r border-gray-50 flex flex-col justify-center min-w-0">
                    {isReconciled && (
                        <>
                            <p className="text-[10px] font-black text-gray-800 truncate uppercase">{counterpartName || '—'}</p>
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                                {counterpartRfc || '—'}
                                {linkedCfdis.length > 1 && (
                                    <span className="ml-1 text-emerald-600">+{linkedCfdis.length - 1} más</span>
                                )}
                            </p>
                        </>
                    )}
                </div>

                <div className="px-3 py-4 border-r border-gray-50 flex items-center justify-center">
                    {estadoBadge}
                </div>

                <div className="px-2 py-4 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {isReconciled ? (
                        <>
                            {linkedCfdis.length === 1 && cfdi?.uuid && (
                                <>
                                    <button
                                        onClick={() => onViewPdf(cfdi.uuid, counterpartName || cfdi.uuid)}
                                        title="Ver PDF"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm bg-white border border-gray-100"
                                    >
                                        <span className="material-symbols-outlined text-base">visibility</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={handleUnlink}
                                disabled={loadingUnlink}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm bg-white border border-gray-100 ml-1"
                                title={linkedCfdis.length > 1 ? `Desvincular todas (${linkedCfdis.length})` : 'Desvincular'}
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
