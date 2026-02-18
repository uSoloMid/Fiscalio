import { useEffect, useState } from 'react';
import {
    getProvisionalSummary,
    getBucketDetails,
    updateDeductibility,
    exportDetailedBucketPdf,
    exportCfdiPdf,
    exportProvisionalExcel
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
    alertas: Array<{ type: string, message: string }>;
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

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const data = await getProvisionalSummary(activeRfc, period.year, period.month);
            setSummary(data);
        } catch (error) {
            console.error("Error fetching provisional summary", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, [activeRfc, period]);

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
                is_deductible: !item.is_deductible
            });
            setDetailData(prev => prev.map(i => i.uuid === item.uuid ? { ...i, is_deductible: !i.is_deductible } : i));
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
        const query = new URLSearchParams();
        query.append('rfc', activeRfc);
        query.append('year', period.year.toString());
        query.append('month', period.month.toString());
        window.open(`/api/provisional/export-pdf-summary?${query.toString()}`, '_blank');
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
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
                                        {formatCurrency(summary?.ingresos.total_efectivo || 0)}
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
                                        {formatCurrency(summary?.egresos.total_efectivo || 0)}
                                    </div>
                                </div>

                                {/* Card 3: Balance */}
                                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-xl shadow-gray-200/20 flex items-center justify-between group">
                                    <div className="flex-1">
                                        <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2 italic">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                            Balance Operativo (Estimado)
                                        </div>
                                        <div className={`text-4xl font-black tracking-tighter ${((summary?.ingresos.total_efectivo || 0) - (summary?.egresos.total_efectivo || 0)) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {formatCurrency((summary?.ingresos.total_efectivo || 0) - (summary?.egresos.total_efectivo || 0))}
                                        </div>
                                    </div>
                                    <div className="border-l border-gray-100 pl-6 space-y-3">
                                        <div className="text-right">
                                            <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">IVA Trasladado</div>
                                            <div className="text-sm font-black text-emerald-600">{formatCurrency(summary?.ingresos.iva.suma_efectivo || 0)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">IVA Acreditable</div>
                                            <div className="text-sm font-black text-blue-600">{formatCurrency(summary?.egresos.iva.suma_efectivo || 0)}</div>
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
                                                <TableRow label="Base (Subtotal)" data={summary?.ingresos.subtotal} bucketPrefix="ingresos_subtotal" />
                                                <TableRow label="IVA (16%)" data={summary?.ingresos.iva} bucketPrefix="ingresos_iva" />
                                                <TableRow label="Total Facturado" data={summary?.ingresos.total} bucketPrefix="ingresos_total" />
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
                                                <TableRow label="Base (Subtotal)" data={summary?.egresos.subtotal} bucketPrefix="egresos_subtotal" mode="egresos" />
                                                <TableRow label="IVA (16%)" data={summary?.egresos.iva} bucketPrefix="egresos_iva" mode="egresos" />
                                                <TableRow label="Total Gastado" data={summary?.egresos.total} bucketPrefix="egresos_total" mode="egresos" />
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
                                        <button onClick={() => loadBucketDetail('egresos_nodeducibles')} className="text-left group/item">
                                            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Pagados (PUE/REP)</div>
                                            <div className="text-5xl font-black group-hover:text-blue-300 transition-colors tracking-tighter">
                                                {formatCurrency(summary?.no_deducibles.total_efectivo || 0)}
                                            </div>
                                        </button>
                                        <button onClick={() => loadBucketDetail('egresos_nodeducibles_pendiente')} className="text-left group/item">
                                            <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Pendientes (CxP)</div>
                                            <div className="text-5xl font-black text-white/40 group-hover:text-orange-300 transition-colors tracking-tighter">
                                                {formatCurrency(summary?.no_deducibles.total_pendiente || 0)}
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
                                                        <span className="text-[9px] font-bold text-gray-300 truncate tracking-wider">
                                                            UUID: {item.uuid}
                                                        </span>
                                                    </div>
                                                    <div className="text-base font-black text-gray-900 truncate mb-1 uppercase tracking-tight">{item.nombre}</div>
                                                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                        <span>{USO_CFDI[item.uso_cfdi] || item.uso_cfdi}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="text-2xl font-black text-gray-900 tracking-tighter">{formatCurrency(item.total)}</div>
                                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">IVA: {formatCurrency(item.iva)}</div>
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
