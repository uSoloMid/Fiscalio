import { useEffect, useState } from 'react';
import {
    getProvisionalSummary,
    getBucketDetails,
    updateDeductibility,
    exportDetailedBucketPdf,
    exportCfdiPdf,
    exportProvisionalExcel,
    exportProvisionalPdfSummary,
    getBusinessNotes,
    resolveBusinessNote
} from '../services';
import { PpdExplorer, RepExplorer } from './ProvisionalExplorers';

interface TaxBreakdown {
    pue: number;
    ppd: number;
    rep: number;
    suma_devengado: number;
    suma_efectivo: number;
    pendiente: number;
}

interface SummaryData {
    ingresos: {
        total_efectivo: number;
        subtotal: TaxBreakdown;
        iva: TaxBreakdown;
        retenciones: TaxBreakdown;
        total: TaxBreakdown;
    };
    egresos: {
        total_efectivo: number;
        subtotal: TaxBreakdown;
        iva: TaxBreakdown;
        retenciones: TaxBreakdown;
        total: TaxBreakdown;
    };
    no_deducibles: {
        total_efectivo: number;
        total_pendiente: number;
    };
    alertas: Array<{ type: string, title?: string, message: string }>;
}

const USO_CFDI: Record<string, string> = {
    'G01': 'Adquisición de mercancías',
    'G02': 'Devoluciones, descuentos o bonificaciones',
    'G03': 'Gastos en general',
    'I01': 'Construcciones',
    'I02': 'Mobiliario y equipo de oficina',
    'I03': 'Equipo de transporte',
    'I04': 'Equipo de computo',
    'I05': 'Dados, troqueles, moldes',
    'I06': 'Comunicaciones telefónicas',
    'I07': 'Comunicaciones satelitales',
    'I08': 'Otra maquinaria y equipo',
    'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
    'D02': 'Gastos médicos por incapacidad o discapacidad',
    'D03': 'Gastos funerales',
    'D04': 'Donativos',
    'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
    'D06': 'Aportaciones voluntarias al SAR',
    'D07': 'Primas por seguros de gastos médicos',
    'D08': 'Gastos de transportación escolar obligatoria',
    'D09': 'Depósitos en cuentas especiales para el ahorro, primas que tengan como base planes de pensiones',
    'D10': 'Pagos por servicios educativos (colegiaturas)',
    'P01': 'Por definir',
    'S01': 'Sin efectos fiscales',
    'CP01': 'Pagos'
};

const FORMA_PAGO: Record<string, string> = {
    '01': 'Efectivo',
    '02': 'Nominativo',
    '03': 'Transferencia',
    '04': 'Tarjeta de Crédito',
    '05': 'Monedero Electrónico',
    '06': 'Dinero Electrónico',
    '08': 'Vales de despensa',
    '12': 'Dación en pago',
    '13': 'Pago por subrogación',
    '14': 'Pago por consignación',
    '15': 'Condonación',
    '17': 'Compensación',
    '23': 'Novación',
    '24': 'Confusión',
    '25': 'Remisión de deuda',
    '26': 'Prescripción o caducidad',
    '27': 'A satisfacción del acreedor',
    '28': 'Tarjeta de débito',
    '29': 'Tarjeta de servicios',
    '30': 'Aplicación de anticipos',
    '31': 'Intermediario pagos',
    '99': 'Por definir'
};

interface ProvisionalControlPageProps {
    activeRfc: string;
    clientName: string;
    onBack: () => void;
    initialYear: number;
    initialMonth: number;
    onPeriodChange: (year: number, month: number) => void;
}

export function ProvisionalControlPage({ activeRfc, clientName, onBack, initialYear, initialMonth, onPeriodChange }: ProvisionalControlPageProps) {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailBucket, setDetailBucket] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<any[]>([]);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [view, setView] = useState<'summary' | 'ppd_issued' | 'ppd_received' | 'rep_issued' | 'rep_received'>('summary');

    const [period, setPeriod] = useState({ year: initialYear, month: initialMonth });
    const [updatingUuid, setUpdatingUuid] = useState<string | null>(null);
    const [notes, setNotes] = useState<any[]>([]);
    const [resolvingNoteId, setResolvingNoteId] = useState<number | null>(null);

    const fetchNotes = async () => {
        try {
            const data = await getBusinessNotes(activeRfc);
            setNotes(data);
        } catch { /* non-critical */ }
    };

    const handleResolveNote = async (noteId: number) => {
        setResolvingNoteId(noteId);
        try {
            await resolveBusinessNote(noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch { /* ignore */ } finally {
            setResolvingNoteId(null);
        }
    };

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const data = await getProvisionalSummary(activeRfc, period.year, period.month);
            if (data && data.error) {
                console.error("Provisional Summary Error:", data.error);
                setSummary(null);
            } else {
                setSummary(data);
            }
        } catch (error) {
            console.error("Error fetching provisional summary", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, [activeRfc, period]);

    useEffect(() => {
        fetchNotes();
    }, [activeRfc]);

    const loadBucketDetail = async (bucket: string) => {
        setDetailBucket(bucket);
        setLoadingDetail(true);
        try {
            const data = await getBucketDetails({
                rfc: activeRfc,
                year: period.year,
                month: period.month,
                bucket
            });
            setDetailData(data);
        } catch (error) {
            console.error("Error fetching bucket details", error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const toggleDeductibility = async (item: any) => {
        if (updatingUuid) return;
        setUpdatingUuid(item.uuid);
        try {
            await updateDeductibility(item.uuid, {
                is_deductible: !item.is_deductible,
                deduction_type: 'manual'
            });
            setDetailData(prev => prev.map(i => i.uuid === item.uuid ? { ...i, is_deductible: !i.is_deductible, deduction_type: i.is_deductible ? i.deduction_type : 'manual' } : i));
            fetchSummary();
        } catch (error) {
            console.error("Error updating deductibility", error);
        } finally {
            setUpdatingUuid(null);
        }
    };

    const handleDownloadPdf = () => {
        if (!detailBucket) return;
        exportDetailedBucketPdf({
            rfc: activeRfc,
            year: period.year,
            month: period.month,
            bucket: detailBucket
        });
    };

    const exportSummaryPdf = () => {
        exportProvisionalPdfSummary({
            rfc: activeRfc,
            year: period.year,
            month: period.month
        });
    };

    const formatCurrency = (amount: any) => {
        const val = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);
    };

    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    if (view === 'ppd_issued') return <PpdExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'ppd_received') return <PpdExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;
    if (view === 'rep_issued') return <RepExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="issued" onBack={() => setView('summary')} />;
    if (view === 'rep_received') return <RepExplorer rfc={activeRfc} year={period.year} month={period.month} tipo="received" onBack={() => setView('summary')} />;

    const TableRow = ({ label, data, bucketPrefix, mode = 'ingresos' }: { label: string, data: TaxBreakdown | undefined, bucketPrefix: string, mode?: 'ingresos' | 'egresos' }) => {
        if (!data) return null;
        const mainLabelStyle = "py-4 px-4 text-xs font-bold text-gray-900";
        const valStyle = "text-xs font-medium text-gray-500";
        const totalStyle = mode === 'ingresos' ? "text-xs font-black text-emerald-600" : "text-xs font-black text-blue-600";
        const pendingStyle = "text-xs font-bold text-orange-500";

        if (!data) return null;

        return (
            <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className={mainLabelStyle}>{label}</td>
                <td className="py-4 px-4 text-center">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_pue`)} className={valStyle}>{formatCurrency(data.pue)}</button>
                </td>
                <td className="py-4 px-4 text-center">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_ppd`)} className={valStyle}>{formatCurrency(data.ppd)}</button>
                </td>
                <td className="py-4 px-4 text-center">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_rep`)} className={valStyle}>{formatCurrency(data.rep)}</button>
                </td>
                <td className="py-4 px-4 text-center">
                    <div className={totalStyle}>{formatCurrency(data.suma_efectivo)}</div>
                </td>
                <td className="py-4 px-4 text-center">
                    <button onClick={() => loadBucketDetail(`${bucketPrefix}_pendiente`)} className={pendingStyle}>{formatCurrency(data.pendiente)}</button>
                </td>
            </tr>
        );
    };

    return (
        <div className="h-full bg-[#fdfdfd] flex flex-col font-['Inter']">
            {/* Header matching image */}
            <header className="bg-white px-8 py-6 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Control Fiscal</div>
                        <h1 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
                            <span>Provisional</span>
                            <span className="text-gray-300 font-normal">/</span>
                            <span className="text-gray-500 font-bold uppercase">{clientName}</span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={exportSummaryPdf}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl transition-all border border-red-100 shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-black uppercase tracking-tight">PDF</span>
                    </button>
                    <button
                        onClick={() => exportProvisionalExcel({ rfc: activeRfc, year: period.year, month: period.month })}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl transition-all border border-emerald-100 shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-black uppercase tracking-tight">Excel</span>
                    </button>
                    <select
                        value={period.month}
                        onChange={(e) => {
                            const m = parseInt(e.target.value);
                            setPeriod({ ...period, month: m });
                            onPeriodChange(period.year, m);
                        }}
                        className="bg-gray-50 border-none rounded-2xl px-4 py-2.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select
                        value={period.year}
                        onChange={(e) => {
                            const y = parseInt(e.target.value);
                            setPeriod({ ...period, year: y });
                            onPeriodChange(y, period.month);
                        }}
                        className="bg-gray-50 border-none rounded-2xl px-4 py-2.5 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                        {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-8 relative">
                <div className="max-w-[1400px] mx-auto space-y-10">

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40">
                            <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                            <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Sincronizando balances...</div>
                        </div>
                    ) : (
                        <>
                            {/* Alertas section */}
                            {summary?.alertas && summary.alertas.length > 0 && (
                                <div className="space-y-3">
                                    {summary.alertas.map((alerta, idx) => (
                                        <div key={idx} className={`p-5 rounded-[1.8rem] border flex items-center gap-5 animate-in fade-in slide-in-from-top-4 duration-700 ease-out ${alerta.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-900 shadow-sm' :
                                            alerta.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-900 shadow-sm' :
                                                'bg-blue-50 border-blue-100 text-blue-900 shadow-sm'
                                            }`}>
                                            <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-inherit">
                                                {alerta.type === 'danger' ? (
                                                    <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                ) : (
                                                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-[10px] font-black uppercase tracking-[0.1em] opacity-40 mb-0.5">{alerta.title || 'Advertencia SAT'}</div>
                                                <div className="text-sm font-bold tracking-tight">{alerta.message}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Diagnóstico de Cobertura SAT */}
                            {notes.length > 0 && (
                                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="px-8 py-5 border-b border-gray-50 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                                            <span className="material-symbols-outlined text-violet-500 text-base">radar</span>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-violet-500 uppercase tracking-widest">Diagnóstico Automático</div>
                                            <div className="text-sm font-bold text-gray-800">Cobertura SAT — últimos 5 años</div>
                                        </div>
                                        <div className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-widest">{notes.length} hallazgo{notes.length !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {notes.map((note) => {
                                            const colors: Record<string, string> = {
                                                coverage_gap:     'bg-amber-50  border-amber-100  text-amber-800',
                                                credential_error: 'bg-red-50    border-red-100    text-red-800',
                                                expired_fiel:     'bg-rose-50   border-rose-100   text-rose-800',
                                                sat_error:        'bg-orange-50 border-orange-100 text-orange-800',
                                                info:             'bg-blue-50   border-blue-100   text-blue-800',
                                            };
                                            const icons: Record<string, string> = {
                                                coverage_gap:     'calendar_today',
                                                credential_error: 'key_off',
                                                expired_fiel:     'badge',
                                                sat_error:        'cloud_off',
                                                info:             'info',
                                            };
                                            const colorClass = colors[note.type] || colors.info;
                                            const icon = icons[note.type] || 'info';
                                            const typeLabel: Record<string, string> = {
                                                coverage_gap:     'Brecha de cobertura',
                                                credential_error: 'Error de credenciales',
                                                expired_fiel:     'FIEL vencida',
                                                sat_error:        'Error SAT',
                                                info:             'Información',
                                            };
                                            return (
                                                <div key={note.id} className={`px-8 py-5 flex items-start gap-4 ${colorClass.split(' ')[0]}`}>
                                                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-white/70 border ${colorClass.split(' ')[1]}`}>
                                                        <span className="material-symbols-outlined text-base">{icon}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-50">{typeLabel[note.type] || note.type}</span>
                                                            {note.invoice_type && (
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${note.invoice_type === 'issued' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                                                    {note.invoice_type === 'issued' ? 'Emitidas' : 'Recibidas'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm font-bold mb-1">{note.title}</div>
                                                        <div className="text-xs opacity-70 whitespace-pre-line leading-relaxed">{note.body}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleResolveNote(note.id)}
                                                        disabled={resolvingNoteId === note.id}
                                                        className="flex-shrink-0 p-1.5 hover:bg-white/60 rounded-lg transition-colors opacity-40 hover:opacity-100"
                                                        title="Marcar como revisado"
                                                    >
                                                        {resolvingNoteId === note.id
                                                            ? <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                                            : <span className="material-symbols-outlined text-sm">check_circle</span>
                                                        }
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Top row cards matching image */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Card 1: Ingresos */}
                                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-xl shadow-gray-200/20 relative group overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4">
                                        <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full tracking-widest uppercase">Efectivo</span>
                                    </div>
                                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mb-6 group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                    </div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ingresos del Mes</div>
                                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency(summary?.ingresos?.total_efectivo || 0)}
                                    </div>
                                </div>

                                {/* Card 2: Gastos */}
                                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-xl shadow-gray-200/20 relative group overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4">
                                        <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full tracking-widest uppercase">Deducible</span>
                                    </div>
                                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mb-6 group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                                        </svg>
                                    </div>
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Gastos del Mes</div>
                                    <div className="text-4xl font-black text-gray-900 tracking-tighter">
                                        {formatCurrency(summary?.egresos?.total_efectivo || 0)}
                                    </div>
                                </div>

                                {/* Card 3: Balance */}
                                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-xl shadow-gray-200/20 flex items-center justify-between group">
                                    <div className="flex-1">
                                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2 italic">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                            Balance Operativo (Estimado)
                                        </div>
                                        <div className={`text-4xl font-black tracking-tighter ${((summary?.ingresos?.total_efectivo || 0) - (summary?.egresos?.total_efectivo || 0)) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {formatCurrency((summary?.ingresos?.total_efectivo || 0) - (summary?.egresos?.total_efectivo || 0))}
                                        </div>
                                    </div>
                                    <div className="border-l border-gray-100 pl-6 space-y-3">
                                        <div className="text-right">
                                            <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">IVA Trasladado</div>
                                            <div className="text-sm font-black text-emerald-600">{formatCurrency(summary?.ingresos?.iva?.suma_efectivo || 0)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">IVA Acreditable</div>
                                            <div className="text-sm font-black text-blue-600">{formatCurrency(summary?.egresos?.iva?.suma_efectivo || 0)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tables middle section */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                {/* Ingresos Table */}
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-emerald-500/5 overflow-hidden">
                                    <div className="p-8 pb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3 italic capitalize">
                                            <span className="w-1.5 h-6 bg-emerald-500 rounded-full not-italic"></span>
                                            Cuadro de Ingresos
                                        </h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => setView('ppd_issued')} className="text-[9px] font-black text-gray-400 hover:text-emerald-600 uppercase tracking-widest border border-gray-100 px-3 py-1.5 rounded-xl transition-all">PPD Explorer</button>
                                            <button onClick={() => setView('rep_issued')} className="text-[9px] font-black text-gray-400 hover:text-emerald-600 uppercase tracking-widest border border-gray-100 px-3 py-1.5 rounded-xl transition-all">REP Explorer</button>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-left text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                                    <th className="py-4 px-4 w-1/3">Concepto</th>
                                                    <th className="py-4 px-4 text-center">PUE</th>
                                                    <th className="py-4 px-4 text-center">PPD</th>
                                                    <th className="py-4 px-4 text-center">REP</th>
                                                    <th className="py-4 px-4 text-center text-emerald-600">Efectivo</th>
                                                    <th className="py-4 px-4 text-center">Pendiente</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <TableRow label="Base (Subtotal)" data={summary?.ingresos?.subtotal} bucketPrefix="ingresos_subtotal" />
                                                <TableRow label="IVA (16%)" data={summary?.ingresos?.iva} bucketPrefix="ingresos_iva" />
                                                <TableRow label="Total Facturado" data={summary?.ingresos?.total} bucketPrefix="ingresos_total" />
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Gastos Table */}
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-blue-500/5 overflow-hidden">
                                    <div className="p-8 pb-4 flex items-center justify-between">
                                        <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3 italic capitalize">
                                            <span className="w-1.5 h-6 bg-blue-500 rounded-full not-italic"></span>
                                            Cuadro de Gastos
                                        </h3>
                                        <div className="flex gap-2">
                                            <button onClick={() => setView('ppd_received')} className="text-[9px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest border border-gray-100 px-3 py-1.5 rounded-xl transition-all">PPD Explorer</button>
                                            <button onClick={() => setView('rep_received')} className="text-[9px] font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest border border-gray-100 px-3 py-1.5 rounded-xl transition-all">REP Explorer</button>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-left text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                                    <th className="py-4 px-4 w-1/3">Concepto</th>
                                                    <th className="py-4 px-4 text-center">PUE</th>
                                                    <th className="py-4 px-4 text-center">PPD</th>
                                                    <th className="py-4 px-4 text-center">REP</th>
                                                    <th className="py-4 px-4 text-center text-blue-600">Deducible</th>
                                                    <th className="py-4 px-4 text-center text-orange-400">CxP</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <TableRow label="Base (Subtotal)" data={summary?.egresos?.subtotal} bucketPrefix="egresos_subtotal" mode="egresos" />
                                                <TableRow label="IVA (16%)" data={summary?.egresos?.iva} bucketPrefix="egresos_iva" mode="egresos" />
                                                <TableRow label="Total Gastado" data={summary?.egresos?.total} bucketPrefix="egresos_total" mode="egresos" />
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom dark card matching image */}
                            <section className="bg-[#101827] rounded-[3rem] p-10 text-white relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                                <div className="relative z-10">
                                    <h3 className="text-lg font-black mb-10 tracking-tight flex items-center gap-3 uppercase italic">
                                        <span className="w-1.5 h-6 bg-blue-400 rounded-full not-italic"></span>
                                        Gastos No Deducibles
                                    </h3>
                                    <div className="flex gap-20">
                                        <button onClick={() => loadBucketDetail('egresos_nodeducibles_pagados')} className="text-left group/item">
                                            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Pagados (PUE/REP)</div>
                                            <div className="text-5xl font-black group-hover:text-blue-300 transition-colors tracking-tighter">
                                                {formatCurrency(summary?.no_deducibles?.total_efectivo || 0)}
                                            </div>
                                        </button>
                                        <button onClick={() => loadBucketDetail('egresos_nodeducibles_pendiente')} className="text-left group/item">
                                            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Pendientes (CxP)</div>
                                            <div className="text-5xl font-black text-white/40 group-hover:text-orange-300 transition-colors tracking-tighter">
                                                {formatCurrency(summary?.no_deducibles?.total_pendiente || 0)}
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </main>

            {/* Slide-over Detail Panel */}
            {detailBucket && (
                <>
                    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] transition-opacity animate-in fade-in duration-300" onClick={() => setDetailBucket(null)}></div>
                    <div className="fixed top-0 right-0 h-full w-full max-w-4xl bg-white shadow-2xl z-[101] transform transition-transform duration-500 ease-out animate-in slide-in-from-right flex flex-col">
                        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3 italic capitalize">
                                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full not-italic"></span>
                                    {detailBucket.replace(/_/g, ' ')}
                                </h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic">Detalle de facturas integradas</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleDownloadPdf}
                                    className="p-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl transition-all group"
                                    title="Descargar PDF de este detalle"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                </button>
                                <button onClick={() => setDetailBucket(null)} className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30 custom-scrollbar">
                            {loadingDetail ? (
                                <div className="flex flex-col items-center justify-center py-40">
                                    <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {detailData.map((item) => (
                                        <div key={item.uuid} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all group/item overflow-hidden relative">
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${item.is_deductible ? 'bg-emerald-500' : 'bg-red-400'}`}></div>

                                            <div className="flex items-center justify-between gap-6 relative z-10">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                        <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg tracking-widest">
                                                            {item.fecha}
                                                        </span>
                                                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg tracking-widest uppercase ${item.metodo_pago === 'PUE' ? 'bg-emerald-50 text-emerald-600' : item.metodo_pago === 'REP' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                            {item.metodo_pago}
                                                        </span>

                                                        {item.warning && (
                                                            <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight animate-pulse">
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                                {item.warning}
                                                            </div>
                                                        )}

                                                        <span className="text-[9px] font-bold text-gray-300 truncate tracking-wider">
                                                            UUID: {item.uuid}
                                                        </span>
                                                        {!item.is_deductible && item.reason && (
                                                            <span className="text-[9px] font-black px-2 py-1 rounded-lg tracking-widest uppercase bg-red-50 text-red-600 border border-red-100 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[10px]">error</span>
                                                                {item.reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-base font-black text-gray-900 truncate mb-1 uppercase tracking-tight">{item.nombre}</div>
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        <span className="flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                            {USO_CFDI[item.uso_cfdi] || item.uso_cfdi}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                                            {FORMA_PAGO[item.forma_pago] || item.forma_pago}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Base: {formatCurrency(item?.subtotal)}</div>
                                                    <div className="text-2xl font-black text-gray-900 tracking-tighter">{formatCurrency(item?.total)}</div>
                                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">IVA: {formatCurrency(item?.iva)}</div>
                                                </div>

                                                <div className="flex items-center gap-2 pl-6 border-l border-gray-50">
                                                    {detailBucket.startsWith('egresos') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleDeductibility(item); }}
                                                            disabled={!!updatingUuid}
                                                            className={`p-3 rounded-2xl transition-all ${item.is_deductible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                                                        >
                                                            {updatingUuid === item.uuid ? (
                                                                <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                                                            ) : (
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.is_deductible ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                    <button onClick={() => exportCfdiPdf(item.uuid)} className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-2xl transition-all shadow-sm">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
